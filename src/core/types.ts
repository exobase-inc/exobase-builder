

export type UserAccessControlLevel = 'user' | 'admin'

export type Language = 'typescript'
  | 'javascript'
  | 'python'
  | 'swift'

export type CloudProvider = 'aws'
  | 'gcp'
  | 'vercel'
  | 'azure'
  | 'netlify'
  | 'ibm'

export type CloudService = 'lambda'
  | 'ec2'
  | 'ecs'
  | 'cloud-run'
  | 'cloud-function'

export type ExobaseService = 'api'
  | 'app'
  | 'webhook-server'

export type StackKey = `${ExobaseService}:${CloudProvider}:${CloudService}:${Language}`
export type ExobaseServiceKey = `${ExobaseService}:${CloudProvider}:${CloudService}`

export type MembershipAccessLevl = 'owner'
  | 'developer'
  | 'auditor'

export type DeploymentStatus = 'queued'
  | 'canceled'
  | 'in_progress'
  | 'success'
  | 'partial_success'
  | 'failed'

export type User = {
  _view: 'exo.user',
  id: string
  did: string
  email: string
  acl: UserAccessControlLevel
}

export type Deployment = {
  _view: 'exo.deployment'
  id: string
  platformId: string
  environmentId: string
  serviceId: string
  startedAt: number
  finishedAt: number
  status: DeploymentStatus
  ledger: DeploymentLedgerItem[]
  logs: string
}

export type Service = {
  _view: 'exo.service'
  id: string
  name: string
  platformId: string
  provider: CloudProvider
  service: CloudService
  type: ExobaseService
  language: Language
  source: {
    repository: string
    branch: string
  }
  key: StackKey
  instances: ServiceInstance[]
}

export type ServiceInstance = {
  _view: 'exo.environment-instance'
  id: string
  environmentId: string
  mute: boolean
  config: {
    type: ExobaseServiceKey
  } & Record<string, any>
  deployments: Deployment[]
  attributes: Record<string, string | number>
}

export type Environment = {
  _view: 'exo.environment'
  id: string
  name: string
}

export type PlatformPreView = {
  _view: 'exo.platform-preview'
  id: string
  name: string
}

export type VercelProviderConfig = {
  token: string
}

export type AWSProviderConfig = {
  accessKeyId: string
  accessKeySecret: string
  region: string
}

export type GCPProviderConfig = {
  jsonCredentials: string
}

export type HerokuProviderConfig = {

}

export type Platform = {
  _view: 'exo.platform'
  id: string
  name: string
  environments: Environment[]
  services: Service[]
  providers: {
    aws: {
      accessKeyId: '***************' | null
      accessKeySecret: '***************' | null
      region: string
      configured: boolean
    }
    gcp: GCPProviderConfig & {
      configured: boolean
    }
    vercel: VercelProviderConfig & {
      configured: boolean
    }
    heroku: HerokuProviderConfig & {
      configured: boolean
    }
  }
}

export type ElevatedPlatform = {
  _view: 'exo.platform.elevated'
  id: string
  name: string
  environments: Environment[]
  services: Service[]
  providers: {
    aws?: AWSProviderConfig
    gcp?: GCPProviderConfig
    vercel?: VercelProviderConfig
    heroku?: HerokuProviderConfig
  }
}

export type DeploymentContext = {
  _view: 'exo.deploymencontext'
  platform: Omit<ElevatedPlatform, 'services'>
  service: Omit<Service, 'instances'>
  instance: ServiceInstance
  environment: Environment
  deployment: Deployment
}

export interface DeploymentLedgerItem {
  status: DeploymentStatus
  timestamp: number
  source: string
}