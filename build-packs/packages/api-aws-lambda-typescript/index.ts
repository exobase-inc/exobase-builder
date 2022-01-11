import _ from 'radash'
import * as pulumi from '@pulumi/pulumi'
import * as aws from '@pulumi/aws'
import fs from 'fs-extra'
import { DeploymentContext } from '@exobase/client-js'
import { AWSLambdaAPI } from '@exobase/pulumi-aws-lambda-api'


type Config = {
  timeout: number
  memory: number
}

type Outputs = {
  url: pulumi.Output<string> | string
}

const main = async (): Promise<Outputs> => {

  //
  //  READ PROJECT CONFIG
  //
  const context = await fs.readJSON('./context.json') as DeploymentContext
  const {
    platform,
    service,
    deployment
  } = context
  const config = deployment.config.stack as Config


  //
  //  SETUP PROVIDER
  //
  const provider = new aws.Provider('aws', {
    secretKey: platform.providers.aws.accessKeySecret,
    accessKey: platform.providers.aws.accessKeyId,
    region: platform.providers.aws.region as aws.Region
  })


  //
  //  CREATE API/LAMBDA RESOURCES
  //
  const api = new AWSLambdaAPI('api', {
    sourceDir: `${__dirname}/source`,
    sourceExt: 'ts',
    distDirName: 'build',
    buildCommand: (() => {
      const useNvm = !!process.env.USE_NVM
      const nvmPrefix = 'source ~/.nvm/nvm.sh && nvm use && '
      const cmd = 'yarn && yarn build && cp package.json ./build/package.json && cd build && yarn'
      return `${useNvm ? nvmPrefix : ''}${cmd}`
    })(),
    runtime: 'nodejs14.x',
    timeout: toNumber(config.timeout),
    memory: toNumber(config.memory),
    environmentVariables: [
      ...deployment.config.environmentVariables,
      {
        name: 'EXOBASE_PLATFORM',
        value: platform.name
      }, {
        name: 'EXOBASE_SERVICE',
        value: service.name
      }
    ],
    domain: service.domain
  }, { provider })

  return {
    url: service.domain ? service.domain.fqd : api.api.url
  }
}

const toNumber = (value: string | number): number => {
  if (_.isString) return parseInt(value as string)
  return value as number
}

export default main()