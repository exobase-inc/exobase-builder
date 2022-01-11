import _ from 'radash'
import cmd from 'cmdish'
import config from '../../core/config'

import type { Props } from '@exobase/core'
import { useJsonArgs } from '@exobase/hooks'
import { useExpress } from '@exobase/express'


interface Args {
  deploymentId: string
}

interface Services {}

async function destroyStack({ args }: Props<Args, Services>): Promise<void> {

  // Don't await. Just kick it off and forget it
  cmd(`yarn run destroy-stack --deploymentId ${args.deploymentId}`, {
    cwd: config.scriptsDir
  })

}

export default _.compose(
  useExpress(),
  useJsonArgs<Args>(yup => ({
    deploymentId: yup.string().required()
  })),
  destroyStack
)