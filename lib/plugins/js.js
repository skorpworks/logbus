'use strict'

// Operate on events with a user-defined javascript function(event). If
// returns non-null, then result of function is emitted as the event.

// Stages can define a `lastCall` function that will be called when pipeline
// is shut down.  It should return event to emit if applicable.

var os = require('os')

function Plugin(config) {
  if (config.function === undefined) {
    throw new Error('`function` to call not defined')
  }
  var sandbox = {
    hostname: os.hostname(),
    config: config,
    util: require('util'),
    moment: require('moment')
  }
  this.function = config.function.bind(sandbox)
  if (typeof(config.lastCall) === 'function') {
    this.lastCall = config.lastCall.bind(sandbox)
  }
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

Plugin.prototype.stop = function(cb) {
  // Last chance for stage to emit events in case it's holding state.
  if (this.lastCall) {
    this.emitEvent(this.lastCall())
  }
  cb()
}

module.exports = Plugin
