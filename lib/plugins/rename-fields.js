'use strict'

// Rename field names according to `fields` ({old: new}) mapping.

const _ = require('lodash')

module.exports = (config, logbus) => {
  if (config.fields === undefined) {
    throw Error('undefined config: fields')
  }
  const fields = config.fields

  function onInput(event) {
    try {
      _.each(fields, (dst, src) => {
        if (event[src] !== undefined) {
          event[dst] = event[src]
          delete event[src]
        }
      })
      logbus.event(event)
    }
    catch (err) {
      logbus.error(err)
    }
  }

  return { onInput }
}
