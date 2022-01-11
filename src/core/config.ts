import path from 'path'


const get = <T = string>(name: string, defaultValue: T = null, cast: (v: any) => T = (v) => v): T => {
    const val = process.env[name]
    if (!val) return defaultValue
    return cast(val)
}

const env = get('EXO_ENV')

const config = {
    env,
    logLevel: get('LOG_LEVEL'),
    version: get('VERSION'),
    pulumiAccessToken: get('PULUMI_ACCESS_TOKEN'),
    exobaseApiUrl: get('EXOBASE_API_URL'),
    exobaseToken: get('EXOBASE_TOKEN'),
    rootDir: path.join(__dirname, '../..'),
    logDir: path.join(__dirname, '../../logs'),
    stackBuilderDir: path.join(__dirname, '../../build-packs'),
    scriptsDir: path.join(__dirname, '../builder')
}

export type Config = typeof config

export default config