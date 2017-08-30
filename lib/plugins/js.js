'use strict'

// Operate on events with a user-defined javascript function(event). If
// returns non-null, then result of function is emitted as the event.

var os = require('os')

function Plugin(config) {
  if (config.function === undefined) {
    throw new Error('`function` to call not defined')
  }
  this.function = config.function.bind({
    hostname: os.hostname(),
    config: config,
    util: require('util'),
    moment: require('moment')
  })
}

Plugin.prototype.onInput = function(data) {
  try {
    var event = this.function(data)
    if (event) {
      this.emitEvent(event)
    }
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
