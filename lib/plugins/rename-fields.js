
// Rename field names according to `fields` ({old: new}) mapping.

const _ = require('lodash')

module.exports = (config, logbus) => {
  if (!config.fields) {
    throw Error('undefined config: fields')
  }

  function onInput(event) {
    _.each(config.fields, (dst, src) => {
      if (typeof event[src] !== 'undefined') {
        event[dst] = event[src]
        delete event[src]
      }
    })
    logbus.event(event)
  }

  return {onInput}
}
