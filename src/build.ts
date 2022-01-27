import cmd from 'cmdish'
import path from 'path'
import api from './core/api'
import config from './core/config'
import { PassThrough } from 'stream'


type Args = {
  action: 'deploy-domain' | 'deploy-stack' | 'destroy-stack'
  deploymentId: string
}

const args: Args = JSON.parse(Buffer.from(process.env.TASK_ARGS, 'base64').toString())

const command = (() => {
  if (args.action === 'deploy-domain') {
    return `yarn deploy-domain --deploymentId ${args.deploymentId}`
  }
  if (args.action === 'deploy-stack') {
    return `yarn deploy-stack --deploymentId ${args.deploymentId}`
  }
  if (args.action === 'destroy-stack') {
    return `yarn destroy-stack --deploymentId ${args.deploymentId}`
  }
})()

console.log({
  ...args,
  command
})

const child = cmd.create(command, {
  cwd: path.join(__dirname, '..')
})

const outStream = new PassThrough()
child.stdout.pipe(outStream)
child.stderr.pipe(outStream)

outStream.on('data', (chunk) => {
  if (process.env.EXO_ENV === 'local') {
    console.log(chunk.toString())
  }
  api.deployments.appendLogChunk({
    deploymentId: args.deploymentId,
    chunk: {
      content: chunk.toString(),
      timestamp: Date.now()
    }
  }, { token: config.exobaseToken })
})