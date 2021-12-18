import _ from 'radash'
import type { Props } from '@exobase/core'
import { useExpress } from '@exobase/express'


interface Args {}

interface Services {}

interface Response {
  message: string
}

async function ping(_props: Props<Args, Services>): Promise<Response> {
  return {
    message: 'pong'
  }
}

export default _.compose(
  useExpress(),
  ping
)