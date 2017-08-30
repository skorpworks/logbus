'use strict'

// Emit JSON strings as javascript objects.

function Plugin(config) {
}

Plugin.prototype.onInput = function(event) {
  try {
    this.emitEvent(JSON.parse(event))
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
