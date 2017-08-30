'use strict'

// Emit YAML strings as javascript objects.

var yaml = require('js-yaml')

function Plugin(config) {
}

Plugin.prototype.onInput = function(event) {
  try {
    this.emitEvent(yaml.load(event))
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
