import _ from 'radash'
import makeApi from '@exobase/client-js'
import config from './config'

export default makeApi(config.exobaseApiUrl)