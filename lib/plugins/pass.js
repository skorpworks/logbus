'use strict'

// Emit event as-is.  Intended as a template plugin.

function Plugin(config) {
  // One way to handle optional config parameters.
  // this.something = config.something || 'SOME DEFAULT'

  // One way to handle required parameters.
  // if (config.something === undefined) {
  //   throw Error('`something` not defined')
  // }
  // this.something = config.something
}

Plugin.prototype.onInput = function(event) {
  try {
    this.emitEvent(event)
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
