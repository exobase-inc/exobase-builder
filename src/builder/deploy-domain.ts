import _, { Defer } from 'radash'
import fs from 'fs-extra'
import parseArgs from 'minimist'
import api from '../core/api'
import config from '../core/config'
import cmd from 'cmdish'
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
  const { data: { context } } = await api.domainDeployments.getContext({
    deploymentId
  }, { token: config.exobaseToken })
  const { domain, platform } = context

  console.log('>>> CONTEXT')
  console.log(context)


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
    replacement: context.domain.buildPack.name
  })
  await replaceInFile({
    file: `${workingDir}/index.js`,
    find: /{{build-package}}/,
    replacement: context.domain.buildPack.name
  })
  const installBuildPackCmd = context.domain.buildPack.version
    ? `yarn add @exobase/${context.domain.buildPack.name}@${context.domain.buildPack.version}`
    : `yarn add @exobase/${context.domain.buildPack.name}`
  await cmd(installBuildPackCmd, {
    cwd: workingDir
  })


  //
  //  Update the build pack version if it wasn't already set
  //
  if (!context.domain.buildPack.version) {
    const pj = await fs.readJSON(`${workingDir}/package.json`)
    await api.domains.setBuildPackVersion({
      platformId: platform.id,
      domainId: domain.id,
      version: pj.dependencies[`@exobase/${context.domain.buildPack.name}`].replace(/\^/, '')
    }, { token: config.exobaseToken })
  }


  //
  //  Write all platform/project/environment/deployment data to temp
  //
  await fs.writeJson(`${workingDir}/context.json`, context)



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