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
  const firstDefined = (fields, event) => fields.map(i => event[i]).filter(i => i !== undefined).shift()
  const lookup = {}
  _.each(config.fields, (fields, dst) => {
    if (typeof fields === 'string') {
      fields = [fields]
    }
    lookup[dst] = _.partial(firstDefined, fields)
  })

  function onInput(event) {
    logbus.event(_.mapValues(lookup, f => f(event)))
  }

  return { onInput }
}
