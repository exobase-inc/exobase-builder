import parse from '../config-parser'
import * as chai from 'chai'

const { assert } = chai

describe('config-parser', () => {
  test('correctly generates expected json', async () => {  
    const result = await parse(`${__dirname}/config-in.yml`)
    const expected = require(`${__dirname}/config-expected.json`)
    assert.deepEqual(expected, result)
  })
  test('returns empty valid object if file does not exist', async () => {  
    const result = await parse(`${__dirname}/does-not-exist.yml`)
    const expected = {
      services: []
    }
    assert.deepEqual(expected, result)
  })
})