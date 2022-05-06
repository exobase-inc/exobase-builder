import { getFunctionMap, start } from '@exobase/local'
import path from 'path'
import chalk from 'chalk'

const run = () => start({
  port: process.env.PORT ?? '7705',
  functions: getFunctionMap({
    moduleDirectoryPath: path.join(__dirname, 'modules'),
    extensions: ['.ts']
  }).map((f) => ({
    ...f,
    func: async (...args: any[]) => {
      const func = require(f.paths.import).default
      console.log(chalk.green(`${f.module}.${f.function}(req)`))
      return await func(...args)
    }
  }))
}, (p) => {
  console.log(`API running at http://localhost:${p}`)
})

run().catch((err) => {
  console.error(err)
  process.exit(1)
})