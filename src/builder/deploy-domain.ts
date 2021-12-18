import _ from 'radash'
import axios from 'axios'
import fs from 'fs-extra'
import * as stream from 'stream'
import { promisify } from 'util'
import parseArgs from 'minimist'
import makeApi from '../core/api'
import config from '../core/config'
import cmd from 'cmdish'


type Args = {
  deploymentId: string
}

const safeName = (str: string) => str.replace(/[\.\-\s]/g, '_')

const withDefer = async (func: (register: (defer: (err?: Error) => void) => void) => Promise<void>) => {
  let deferedFuncs: Function[] = []
  try {
    await func((fn) => deferedFuncs.push(fn))
  } catch (err) {
    deferedFuncs.map(defered => defered(err))
    return
  }
  deferedFuncs.map(defered => defered())
}

const main = async ({
  deploymentId
}: Args) => withDefer(async (defer) => {

  //
  //  Setup Loggin
  //
  const logFilePath = `${config.logDir}/${_.dashCase(deploymentId)}.log`
  await fs.writeFile(logFilePath, '')
  const logStream = fs.createWriteStream(logFilePath)
  process.stdout.write = process.stderr.write = logStream.write.bind(logStream)

  const api = makeApi(config.exobaseApiUrl)

  defer((err) => {
    const logs = fs.readFileSync(logFilePath, 'utf-8')
    api.platforms.updateDeploymentStatus({
      deploymentId,
      status: err ? 'failed' : 'success',
      source: 'exo.builder.deploy',
      logs
    }, { token: config.exobaseToken })
    fs.removeSync(logFilePath)
  })

  // 
  //  Fetch data from exobase api for this platform/project/environment/deployment
  //
  const { data: { context } } = await api.platforms.getDeploymentContext({
    deploymentId
  }, { token: config.exobaseToken })
  const platformId = context.platform.id
  const serviceId = context.service.id

  console.log('>>> CONTEXT')
  console.log(context)


  // 
  //  Mark deployment as in progress
  //
  await api.platforms.updateDeploymentStatus({
    deploymentId,
    status: 'in_progress',
    source: 'exo.builder.deploy'
  }, { token: config.exobaseToken })


  // 
  //  Create temp pulumi working directory for this work
  //
  const { service } = context
  const deploymentDir = safeName(deploymentId)
  const templateName = `exo-${service.type}-${service.provider}-${service.service}-${service.language}`
  const {
    pulumiTemplatesDir: templatesDir
  } = config
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
  const { repository, branch } = context.service.source
  await downloadZipFile({
    url: `${repository}/archive/refs/heads/${branch}.zip`,
    path: `${workingDir}/source.zip`
  })
  await cmd(`unzip source.zip`, {
    cwd: `${workingDir}`,
    quiet: true
  })
  const repoName = repository.replace(/http.+\//, '')
  await fs.rename(`${workingDir}/${repoName}-${branch}`, `${workingDir}/source`)


  // 
  //  Start Pulumi deploy & get the outputs
  //
  await cmd(`pulumi stack init ${context.environment.name.toLowerCase()}`, {
    cwd: `${workingDir}`
  })
  await cmd('pulumi up --yes', {
    cwd: `${workingDir}`
  })
  const [outputErr, outputStr] = await cmd('pulumi stack output --json', {
    cwd: `${workingDir}`
  })
  if (outputErr) throw outputErr
  const output = JSON.parse(outputStr)
  console.log('>>> OUTPUT')
  console.log(output)


  // 
  //  Update service attributes with the Pulumi outputs  
  //
  await api.platforms.updateServiceAttributes({
    serviceId,
    attributes: output
  })


  // 
  //  Mark deployment with Pulumi status (error/success/partial-success)
  //
  await api.platforms.updateDeploymentStatus({
    deploymentId,
    status: 'success',
    source: 'exo.builder.deploy'
  }, { token: config.exobaseToken })

  // Done... oh shit we did it...
})


main(parseArgs(process.argv) as any as Args).catch((err) => {
  console.error(err)
  process.exit(1)
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