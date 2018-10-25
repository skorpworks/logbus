'use strict'

// Mutate events so that only specific fields are preserved. The `fields`
// mapping can take one of two forms:
//
//   dst: src
//
// or
//
//   dst: [src1, src2, ..., srcN]
//
// With the latter form, the first field in the array with a *defined* value
// (null, 0, false is considered defined) will be used. The dst field will
// always be defined as null downstream if src field not present.

const _ = require('lodash')

module.exports = (config, logbus) => {
  if (config.fields === undefined) {
    throw Error('undefined config: fields')
  }
  const fields = {}
  _.each(config.fields, (sources, dst) => {
    if (typeof sources === 'string') {
      sources = [sources]
    }
    fields[dst] = sources
  })

  function onInput(event) {
    try {
      const copy = {}
      _.each(fields, (sources, dst) => {
        copy[dst] = sources.map(i => event[i]).filter(i => i !== undefined).shift()
      })
      logbus.event(copy)
    }
    catch (err) {
      logbus.error(err)
    }
  }

  return { onInput }
}
