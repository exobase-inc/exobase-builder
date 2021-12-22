import _ from 'radash'
import api from '@exobase/api'
import * as t from './types'


const createApi = (url: string) => {
  const endpoint = api(url)
  return {
    platforms: {
      updateDeploymentStatus: endpoint<{
        deploymentId: string
        status: t.DeploymentStatus
        source: 'exo.builder.deploy'
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
      getDomainDeploymentContext: endpoint<{
        deploymentId: string
      }, {
        context: t.DomainDeploymentContext
      }>({
        module: 'platforms',
        function: 'getDomainDeploymentContext'
      }),
      updateDeploymentFunctions: endpoint<{
        deploymentId: string
        functions: t.ExobaseFunction[]
      }, void>({
        module: 'platforms',
        function: 'updateDeploymentFunctions'
      }),
      updateDeploymentLogs: endpoint<{
        deploymentId: string
        logs: string
      }, void>({
        module: 'platforms',
        function: 'updateDeploymentLogs'
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