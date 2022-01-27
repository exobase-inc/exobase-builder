import _ from 'radash'
import cmd from 'cmdish'
import config from '../../core/config'
import type { Props } from '@exobase/core'
import { useJsonArgs } from '@exobase/hooks'
import { useExpress } from '@exobase/express'
import { useApiKeyAuthentication } from '@exobase/auth'

/**
 * This endpoint is only used locally.
 * The bridge api is used when deployed
 * on Exobase.
 */

interface Args {
  args: {
    action: 'deploy-domain' | 'deploy-stack' | 'destroy-stack'
    deploymentId: string
  }
}

async function triggerBuild({ args }: Props<Args>): Promise<void> {
  cmd(`yarn run build`, {
    cwd: config.rootDir,
    env: {
      TASK_ARGS: Buffer.from(
        JSON.stringify(args.args)
      ).toString('base64')
    }
  })
}

export default _.compose(
  useExpress(),
  useApiKeyAuthentication('our-little-secret'),
  useJsonArgs<Args>(yup => ({
    args: yup.object({
      action: yup.string().oneOf([
        'deploy-domain', 
        'deploy-stack', 
        'destroy-stack'
      ]).required(),
      deploymentId: yup.string().required()
    }).required()
  })),
  triggerBuild
)