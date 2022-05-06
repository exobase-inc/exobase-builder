import cmd from 'cmdish'
import path from 'path'
import api from './core/api'
import config from './core/config'
import { PassThrough } from 'stream'

type Args = {
  deploymentId: string
  workspaceId: string
  platformId: string
  unitId: string
  logId: string
}

const args: Args = JSON.parse(Buffer.from(process.env.TASK_ARGS, 'base64').toString())

const command = `yarn execute-pack --deploymentId ${args.deploymentId} --workspaceId ${args.workspaceId} --platformId ${args.platformId} --unitId ${args.unitId} --logId ${args.logId}`

if (process.env.EXO_ENV === 'local') {
  console.log({
    ...args,
    command
  })
}

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
  api.logs.appendChunk({
    logId: args.logId,
    content: chunk.toString(),
    timestamp: Date.now()
  }, { token: config.exobaseToken })
})