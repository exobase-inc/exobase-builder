import _ from 'radash'
import api from '@exobase/api'
import * as t from '../types'


const createApi = (url: string) => {
  const endpoint = api(url)
  return {
    platforms: {
      updateDeploymentStatus: endpoint<{
        deploymentId: string
        status: t.DeploymentStatus
        source: 'exo.builder.deploy'
        logs?: string
      }, void>({
        module: 'platforms',
        function: 'updateDeploymentStatus'
      }),
      getDeploymentContext: endpoint<{
        deploymentId: string
      }, {
        context: t.DeploymentContext
      }>({
        module: 'platforms',
        function: 'getDeploymentContext'
      }),
      updateServiceAttributes: endpoint<{
        serviceId: string
        attributes: Record<string, string | number | boolean>
      }, void>({
        module: 'platforms',
        function: 'updateServiceAttributes'
      })
    }
  }
}

export type Api = ReturnType<typeof createApi>

export default createApi