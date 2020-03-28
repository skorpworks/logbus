'use strict'

const doc = `
Emit JSON strings as javascript objects.
`
const defaults = {}

module.exports = (config, logbus) => {
  function onInput(event) {
    try {
      logbus.event(JSON.parse(event))
    }
    catch (err) {
      logbus.error(err)
    }
  }

  return { doc, defaults, onInput }
}
