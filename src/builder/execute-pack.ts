import _, { Defer } from 'radash'
import axios from 'axios'
import fs from 'fs-extra'
import * as stream from 'stream'
import { promisify } from 'util'
import api from '../core/api'
import config from '../core/config'
import cmd from 'cmdish'
import JSZip from 'jszip'
import path from 'path'
import octo from 'octokit-downloader'
import slugger from 'url-slug'
import { AWSProvider } from '@exobase/client-js'

type Args = {
  deploymentId: string
  workspaceId: string
  platformId: string
  unitId: string
  logId: string
}

const main = _.defered(async ({ defer, deploymentId, workspaceId, platformId, unitId }: Args & { defer: Defer }) => {

  defer((err) => {
    api.deployments.updateStatus({
      deploymentId,
      workspaceId,
      platformId,
      unitId,
      status: err ? 'failed' : 'success',
    }, { token: config.exobaseToken })
  })

  //
  //  Fetch data from exobase api for this platform/project/environment/deployment
  //
  const { data: { context } } = await api.deployments.getContext({
    deploymentId,
    workspaceId,
    platformId,
    unitId,
  }, { token: config.exobaseToken })

  // 
  //  Mark deployment as in progress
  //
  await api.deployments.updateStatus({
    deploymentId,
    workspaceId,
    platformId,
    unitId,
    status: 'in_progress',
  }, { token: config.exobaseToken })

  //
  //  Create Working Directory
  //
  const workingDir = path.join(__dirname, `../../builds/${slugger(deploymentId)}`)
  await octo.download({
    from: context.pack.version.source,
    to: `${workingDir}.zip`,
    unzip: true
  })
  await fs.writeJson(`${workingDir}/context.json`, context)
  defer(() => {
    if (process.env.EXO_ENV === 'local') {
      return
    }
    cmd(`rm -rf ${workingDir}`)
  })

  //
  //  Download Source
  //
  //  GitHub gives us a zip that contains a single folder with a name
  //  like '{owner}-{repo}-{commit_hash}'. We don't have any easy way
  //  to figure out what the hash is so we use `getSourceDirName` to
  //  get the name of that directory. We then rename it to 'source' as
  //  our terraform build packs will expect.
  //
  const linkResponse = await api.units.getSourceDownloadLink({
    deploymentId,
    workspaceId,
    platformId,
    unitId,
  }, { token: config.exobaseToken })
  if (linkResponse.error) {
    console.error(linkResponse.error)
    return
  }
  await downloadZipFile({
    url: linkResponse.data.url,
    path: `${workingDir}/source.zip`
  })
  await cmd(`unzip source.zip`, {
    cwd: workingDir,
    quiet: true
  })
  const sourceDirName = await getSourceDirName(`${workingDir}/source.zip`)
  await fs.rename(`${workingDir}/${sourceDirName}`, `${workingDir}/source`)

  //
  //  TODO: Read pack.json and execute commands
  //
  if (context.pack.version.manifest.build?.before) {
    await cmd(context.pack.version.manifest.build.before, {
      cwd: workingDir
    })
  }

  //
  //  Write state.tf file and .aws/conf .aws/creds to 
  //  working directory
  //
  if (context.pack.provider === 'aws') {
    const aws = context.provider as AWSProvider
  await fs.writeFile(`${workingDir}/.aws/conf`, `
[exobase_tf_state_man]
output = json
region = us-east-1

[exobase_customer_man]
output = json
region = us-east-1
`, 'utf-8')

  await fs.writeFile(`${workingDir}/.aws/creds`, `
[state]
aws_access_key_id = ${process.env.EXO_STATE_ACCESS_KEY_ID}
aws_secret_access_key = ${process.env.EXO_STATE_ACCESS_KEY}

[client]
aws_access_key_id = ${aws.auth.accessKeyId}
aws_secret_access_key = ${aws.auth.accessKeySecret}
`, 'utf-8')
  
  await fs.writeFile(`${workingDir}/state.tf`, `
terraform {
  backend "s3" {
    bucket                   = "exobase-tf-state"
    key                      = "${slugger(context.platform.id + '-x-' + context.unit.id)}"
    region                   = "us-east-1"
    profile                  = "state"
    dynamodb_table           = "exobase-tf-state-lock"
    shared_credentials_file  = "${workingDir}/.aws/creds"
  }
}
`, 'utf-8')
  } else if (context.pack.provider === 'gcp') {
    // TODO: Implement logic for GCP terraform state/authentication
  }

  //
  //  Run Terraform Deploy
  //
  const [initErr] = await cmd('tf init', { cwd: workingDir })
  if (initErr) {
    throw `Terraform init failed. Code: ${initErr}`
  }
  const [upErr] = await cmd(`tf ${context.deployment.type === 'create' ? 'apply' : 'destroy'} -auto-approve`, { cwd: workingDir })
  if (upErr) {
    console.error('The build pack deployment stack failed to deploy. Check for errors just above this.')
    throw 'Build pack up failed'
  }  

  if (context.deployment.type === 'destroy') {
    return
  }

  //
  //  Collect Output
  //
  const [outputErr, stackOutput] = await cmd('terraform output -json', {
    cwd: workingDir,
    buffer: true
  })
  if (outputErr !== null) {
    console.error('The build pack failed to provide outputs. Check for errors just above this.')
    throw 'Build pack outputs failed'
  }
  const output = stackOutput && stackOutput.length > 2
    ? JSON.parse(stackOutput) as any
    : {}

  //
  //  Update service attributes with the Terraform outputs  
  //
  await api.deployments.recordOutput({
    deploymentId,
    workspaceId,
    platformId,
    unitId,
    output
  }, { token: config.exobaseToken })

  // Done... oh shit we did it...
})


const args: Args = JSON.parse(Buffer.from(process.env.TASK_ARGS, 'base64').toString())
main(args).catch((err) => {
  console.error(err)
})

const downloadZipFile = async ({
  url,
  path
}: {
  url: string
  path: string
}): Promise<any> => {
  const finished = promisify(stream.finished)
  const writer = fs.createWriteStream(path)
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  })
  response.data.pipe(writer)
  return await finished(writer)
}

const getSourceDirName = async (zipPath: string) => {
  const zipFileData = await fs.readFile(zipPath)
  const zip = await JSZip.loadAsync(zipFileData)
  return Object.keys(zip.files)[0]
}
