'use strict'

const doc = `
Emit YAML strings as javascript objects.
`
const defaults = {}

const yaml = require('js-yaml')

module.exports = (config, logbus) => {

  function onInput(event) {
    try {
      logbus.event(yaml.load(event))
    }
    catch (err) {
      logbus.error(err)
    }
  }

  return { doc, defaults, onInput }
}
