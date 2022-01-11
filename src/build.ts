import cmd from 'cmdish'
import path from 'path'

type Args = {
  action: 'deploy-domain' | 'deploy-stack' | 'destroy-stack'
  deploymentId: string
}

const args: Args = JSON.parse(Buffer.from(process.env.TASK_ARGS, 'base64').toString())

cmd((() => {
  if (args.action === 'deploy-domain') {
    return `yarn deploy-domain --deploymentId ${args.deploymentId}`
  }
  if (args.action === 'deploy-stack') {
    return `yarn deploy-stack --deploymentId ${args.deploymentId}`
  }
  if (args.action === 'destroy-stack') {
    return `yarn destroy-stack --deploymentId ${args.deploymentId}`
  }
})(), {
  cwd: path.join(__dirname, '..')
})