import _, { Defer } from 'radash'
import fs from 'fs-extra'
import parseArgs from 'minimist'
import api from '../core/api'
import config from '../core/config'
import cmd from 'cmdish'


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
  const { data: { context } } = await api.domainDeployment.getContext({
    deploymentId
  }, { token: config.exobaseToken })
  const { domain, platform } = context

  console.log('>>> CONTEXT')
  console.log(JSON.stringify(context))


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
  const templateName = `exo-${domain.provider}-domain`
  const {
    pulumiTemplatesDir: templatesDir
  } = config
  const workingDir = `${templatesDir}/packages/${safeName(deploymentId)}`
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
    replacement: safeName(`${platform.id}_${domain.id}`)
  })


  // 
  //  Start Pulumi deploy & get the outputs
  //
  await cmd(`pulumi stack init ${safeName(domain.domain)}`, {
    cwd: `${workingDir}`
  })
  await cmd('pulumi up --yes', {
    cwd: `${workingDir}`
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