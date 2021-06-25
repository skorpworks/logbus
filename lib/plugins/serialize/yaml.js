

// Emit msg formated as YAML.

const yaml = require('js-yaml')

module.exports = (config, logbus) => {
  function onInput(event) {
    try {
      logbus.event(yaml.dump(event))
    } catch (err) {
      logbus.error(err)
    }
  }

  return {onInput}
}
