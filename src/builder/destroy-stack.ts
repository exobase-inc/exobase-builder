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
  // const logStream = fs.createWriteStream(logFilePath)
  // process.stdout.write = process.stderr.write = logStream.write.bind(logStream)


  defer((err) => {
    const logs = fs.readFileSync(logFilePath, 'utf-8')
    api.deployments.updateStatus({
      deploymentId,
      status: err ? 'failed' : 'success',
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
  const withLang = `exo-${service.type}-${service.provider}-${service.service}-${service.language}`
  const withoutLang = `exo-${service.type}-${service.provider}-${service.service}`
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
  //  Run Pulumi Destroy to tear down all infrastructure
  //
  const stackName = safeName(context.service.id)
  await cmd(`pulumi destroy --yes --stack ${stackName}`, {
    cwd: workingDir
  })


  //
  //  Run Pulumi rm to clear all state from pulumi
  //
  await cmd(`pulumi stack rm --yes ${stackName}`, {
    cwd: workingDir
  })


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