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
import path from 'path'


type Args = {
  deploymentId: string
}

const safeName = (str: string) => str.replace(/[\.\-\s]/g, '_')

const main = _.defered(async ({ defer, deploymentId }: Args & { defer: Defer }) => {

  defer((err) => {
    api.deployments.updateStatus({
      deploymentId,
      status: err ? 'failed' : 'success',
      source: 'exo.builder.deploy',
    }, { token: config.exobaseToken })
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
  //  Install the build pack for the service
  //
  const deploymentDir = safeName(deploymentId)
  const buildsDir = path.join(__dirname, '../../builds')
  const templateWorkingDir = path.join(__dirname, '../build-template')
  const workingDir = path.join(__dirname, `../../builds/${deploymentDir}`)
  await cmd(`mkdir ${buildsDir}`)
  await cmd(`cp -r ${templateWorkingDir} ${workingDir}`)
  defer(() => {
    // cmd(`rm -rf ${workingDir}`)
  })
  await replaceInFile({
    file: `${workingDir}/Pulumi.yml`,
    find: /{{build-package}}/,
    replacement: context.service.buildPack.name
  })
  await replaceInFile({
    file: `${workingDir}/index.js`,
    find: /{{build-package}}/,
    replacement: context.service.buildPack.name
  })
  const installBuildPackCmd = context.service.buildPack.version
    ? `yarn add @exobase/${context.service.buildPack.name}@${context.service.buildPack.version}`
    : `yarn add @exobase/${context.service.buildPack.name}`
  await cmd(installBuildPackCmd, {
    cwd: workingDir
  })


  //
  //  Update the build pack version if it wasn't already set
  //
  if (!context.service.buildPack.version) {
    const pj = await fs.readJSON(`${workingDir}/package.json`)
    await api.services.setBuildPackVersion({
      platformId,
      serviceId,
      version: pj.dependencies[`@exobase/${context.service.buildPack.name}`].replace(/\^/, '')
    }, { token: config.exobaseToken })
  }



  //
  //  Write all platform/project/environment/deployment data to temp
  //
  await fs.writeJson(`${workingDir}/context.json`, context)



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
  const functions = context.service.type === 'api' && exobuilds.getFunctionMap({
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
  const stackName = safeName(`${context.service.buildPack.name}-${context.service.id}`)
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
    : {}

  // 
  //  Update service attributes with the Pulumi outputs  
  //
  await api.deployments.updateAttributes({
    deploymentId,
    attributes: {
      version,
      url: output.url,
      outputs: output,
      functions: context.service.type === 'api' ? functions.map(f => ({
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
