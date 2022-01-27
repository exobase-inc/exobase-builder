const { default: main } = require('@exobase/{{build-package}}')

console.log('>>> MAIN')
console.log(main)

main({
  workingDir: __dirname
})