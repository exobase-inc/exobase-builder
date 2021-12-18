import { getFunctionMap, start } from '@exobase/local'

const run = () => start({
  port: '7705',
  functions: getFunctionMap(process.cwd()).map((f) => ({
    ...f,
    func: require(f.paths.import).default
  }))
}, (p) => {
  console.log(`API running at http://localhost:${p}`)
})

run().catch((err) => {
  console.error(err)
  process.exit(1)
})