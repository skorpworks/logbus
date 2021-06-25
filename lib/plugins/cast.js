
// Convert `fields` ({name: type}):
//
// - int: integer
// - float: real number
// - bool: boolean
// - ts-sec: a timestamp from a seconds since epoch
// - ts-msec: a timestamp from a milliseconds since epoch
// - ts-usec: a timestamp from a microseconds since epoch

const moment = require('moment')
const _ = require('lodash')

const CASTS = {
  int: v => parseInt(v),
  float: v => parseFloat(v),
  bool: v => Boolean(v),
  'ts-usec': v => moment.unix(parseInt(v) / 1000000),
  'ts-msec': v => moment.unix(parseInt(v) / 1000),
  'ts-sec': v => moment.unix(parseFloat(v)),
}

module.exports = (config, logbus) => {
  if (!config.fields) {
    throw new Error('undefined config: fields')
  }
  _.each(config.fields, type => {
    if (!CASTS[type]) {
      throw new Error(`unsupported type: ${type}`)
    }
  })

  function onInput(event) {
    try {
      const copy = {...event}
      _.each(config.fields, (type, field) => {
        if (_.has(copy, field)) {
          copy[field] = CASTS[type](copy[field])
        }
      })
      logbus.event(copy)
    } catch (err) {
      logbus.error(err)
    }
  }

  return {onInput}
}
