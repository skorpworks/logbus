'use strict'

// Delete `fields` (array) from events.

const _ = require('lodash')

module.exports = (config, logbus) => {
  if (config.fields === undefined) {
    throw new Error('undefined config: fields')
  }

  function onInput(event) {
    logbus.event(_.omit(event, config.fields))
  }

  return { onInput }
}
