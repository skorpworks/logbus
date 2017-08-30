'use strict'

// Emit events formatted as YAML.

var yaml = require('js-yaml')

function Plugin(config) {
}

Plugin.prototype.onInput = function(event) {
  try {
    this.emitEvent(yaml.safeDump(event))
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
