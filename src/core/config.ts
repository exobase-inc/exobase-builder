
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
    tokenSignatureSecret: get('TOKEN_SIG_SECRET'),
    projectRootDir: get('PROJECT_ROOT_DIR'),
    logDir: get('EXOBASE_LOG_DIR'),
    pulumiTemplatesDir: get('PULUMI_TEMPLATES_DIR'),
    pulumiAccessToken: get('PULUMI_ACCESS_TOKEN'),
    exobaseApiUrl: get('EXOBASE_API_URL'),
    exobaseToken: get('EXOBASE_TOKEN')
}

export type Config = typeof config

export default config