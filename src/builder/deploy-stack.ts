import _, { Defer } from 'radash'
import axios from 'axios'
import fs from 'fs-extra'
import * as stream from 'stream'
import { promisify } from 'util'
import parseArgs from 'minimist'
import api from '../core/api'
import config from '../core/config'
import cmd from 'cmdish'
import exobuilds from '@exobase/builds'
import JSZip from 'jszip'


type Args = {
  deploymentId: string
}

const safeName = (str: string) => str.replace(/[\.\-\s]/g, '_')

const main = _.defered(async ({ defer, deploymentId }: Args & { defer: Defer }) => {


  //
  //  Setup Logging
  //
  const logFilePath = `${config.logDir}/${_.dashCase(deploymentId)}.log`
  await fs.writeFile(logFilePath, '')
  const logStream = fs.createWriteStream(logFilePath)
  process.stdout.write = process.stderr.write = logStream.write.bind(logStream)


  defer((err) => {
    const logs = fs.readFileSync(logFilePath, 'utf-8')
    api.deployments.updateStatus({
      deploymentId,
      status: (() => {
        if (!err) return 'success'
        if (/\+\s+?aws.+?created/.test(logs) || /~\s+?aws.+?updated/.test(logs)) {
          return 'partial_success'
        }
        return 'failed'
      })(),
      source: 'exo.builder.deploy',
    }, { token: config.exobaseToken })
    api.deployments.updateLogs({
      deploymentId,
      logs
    }, { token: config.exobaseToken })
    // fs.removeSync(logFilePath)
  })


  //
  //  Fetch data from exobase api for this platform/project/environment/deployment
  //
  const { data: { context } } = await api.deployments.getContext({
    deploymentId
  }, { token: config.exobaseToken })
  const platformId = context.platform.id
  const serviceId = context.service.id


  // 
  //  Mark deployment as in progress
  //
  await api.deployments.updateStatus({
    deploymentId,
    status: 'in_progress',
    source: 'exo.builder.deploy'
  }, { token: config.exobaseToken })


  // 
  //  Create temp pulumi working directory for this work
  //
  const {
    pulumiTemplatesDir: templatesDir
  } = config
  const { service } = context
  const deploymentDir = safeName(deploymentId)
  const availablePackages = await listDirsInDir(`${templatesDir}/packages`)
  const withLang = `${service.provider}-${service.service}-${service.type}-${service.language}`
  const withoutLang = `${service.provider}-${service.service}-${service.type}`
  const templateName = (() => {
    if (availablePackages.includes(withLang)) return withLang
    if (availablePackages.includes(withoutLang)) return withoutLang
    return null
  })()
  if (!templateName) {
    throw `Could not find a suitable template to create service stack. Tried ${withLang} and ${withoutLang}`
  }
  const workingDir = `${templatesDir}/packages/${deploymentDir}`
  await cmd(`mkdir ${workingDir}`)
  defer(() => {
    cmd(`rm -rf ${workingDir}`)
  })
  await cmd(`cp -a ${templatesDir}/packages/${templateName}/. ${workingDir}`)


  //
  //  Write all platform/project/environment/deployment data to temp
  //
  await fs.writeJson(`${workingDir}/context.json`, context)


  // 
  //  Set the Pulumi project name in the Pulumi.yml
  //
  await replaceInFile({
    file: `${workingDir}/Pulumi.yml`,
    find: /exobase-(.+?)-template/,
    replacement: safeName(`${platformId}_${serviceId}`)
  })


  //
  //  Download Source
  //
  //  GitHub gives us a zip that contains a single folder with a name
  //  like '{owner}-{repo}-{commit_hash}'. We don't have any easy way
  //  to figure out what the hash is so we use `getSourceDirName` to
  //  get the name of that directory. We then rename it to 'source' as
  //  our pulumi template scripts will expect.
  //
  const linkResponse = await api.services.getSourceDownloadLink({
    serviceId,
    platformId,
    deploymentId
  }, { token: config.exobaseToken })
  if (linkResponse.error) {
    console.error(linkResponse.error)
    return
  }
  await downloadZipFile({
    url: linkResponse.data.url,
    path: `${workingDir}/source.zip`
  })
  await cmd(`unzip source.zip`, {
    cwd: `${workingDir}`,
    quiet: true
  })
  const sourceDirName = await getSourceDirName(`${workingDir}/source.zip`)
  await fs.rename(`${workingDir}/${sourceDirName}`, `${workingDir}/source`)
  const functions = service.type === 'api' && exobuilds.getFunctionMap({
    path: `${workingDir}/source`,
    ext: 'ts'
  })
  const pj = await fs.readJson(`${workingDir}/source/package.json`)
  const version = pj?.version ?? ''


  // 
  //  Start Pulumi deploy & get the outputs
  //
  //  If the stack has already been created the init will fail, but the
  //  select will succeed. If the stack has not been created the init
  //  will succeed but the select will fail. Ignoring some errors here
  //  so we don't have to do more work.
  //
  const stackName = safeName(context.service.id)
  await cmd(`pulumi stack init ${stackName}`, {
    cwd: workingDir
  })
  await cmd(`pulumi stack select ${stackName}`, {
    cwd: workingDir
  })
  await cmd(`pulumi refresh --stack ${stackName} --yes`, {
    cwd: workingDir
  })
  const [upErr] = await cmd('pulumi up --yes', {
    cwd: workingDir
  })
  if (upErr !== null) {
    console.error('The Pulumi deployment stack failed to deploy. Check for errors just above this.')
    throw 'Pulumi up failed'
  }
  const [outputErr, stackOutput] = await cmd('pulumi stack output --json', {
    cwd: workingDir,
    buffer: true
  })
  if (outputErr !== null) {
    console.error('The Pulumi stack failed to provide outputs. Check for errors just above this.')
    throw 'Pulumi outputs failed'
  }
  const output = stackOutput && stackOutput.length > 2
    ? JSON.parse(stackOutput) as any
    : { default: { out: {} } }



  // 
  //  Update service attributes with the Pulumi outputs  
  //
  await api.deployments.updateAttributes({
    deploymentId,
    attributes: {
      version,
      url: output.default.url,
      outputs: output.default,
      functions: service.type === 'api' ? functions.map(f => ({
        module: f.module,
        function: f.function
      })) : []
    }
  }, { token: config.exobaseToken })


  // 
  //  Mark deployment with Pulumi status (error/success/partial-success)
  //
  await api.deployments.updateStatus({
    deploymentId,
    status: 'success',
    source: 'exo.builder.deploy'
  }, { token: config.exobaseToken })

  // Done... oh shit we did it...
})


main(parseArgs(process.argv) as any as Args).catch((err) => {
  console.error(err)
  // process.exit(1)
})


const replaceInFile = async ({
  file, find, replacement
}: {
  file: string
  find: RegExp
  replacement: string
}) => {
  const content = await fs.readFile(file, 'utf-8')
  const newContent = content.replace(find, replacement)
  await fs.writeFile(file, newContent)
}

const downloadZipFile = async ({
  url,
  path
}: {
  url: string
  path: string
}): Promise<any> => {
  const finished = promisify(stream.finished)
  const writer = fs.createWriteStream(path)
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  })
  response.data.pipe(writer)
  return await finished(writer)
}

const getSourceDirName = async (zipPath: string) => {
  const zipFileData = await fs.readFile(zipPath)
  const zip = await JSZip.loadAsync(zipFileData)
  return Object.keys(zip.files)[0]
}

const listDirsInDir = async (dirPath: string) => {
  const files = await fs.readdir(dirPath)
  const dirs = []
  for (const file of files) {
    const filePath = `${dirPath}/${file}`
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      dirs.push(file)
    }
  }
  return dirs
}