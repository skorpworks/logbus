
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
  if (!config.fields) {
    throw Error('undefined config: fields')
  }
  const lookup = {}
  _.each(config.fields, (fields, dst) => {
    if (typeof fields === 'string') {
      lookup[dst] = [fields]
    } else {
      lookup[dst] = fields
    }
  })

  function onInput(src) {
    const dst = {}
    _.each(lookup, (sources, field) => {
      dst[field] = _.filter(sources.map(i => src[i])).shift()
    })
    logbus.event(dst)
  }

  return {onInput}
}
