'use strict'

// Emit error events every `interval` seconds. Errors are aggregated by
// stage+msg only a sample of each is emitted in order to reduce log spam -
// seeing the same error msg many times per second is not helpful.
//
// To minimize memory consumption, only `stackDepth` levels of an exceptions are kept.

var moment = require('moment')
var util = require('util')

function Plugin(config) {
  this.interval = config.interval || 60
  this.stackDepth = config.stackDepth || 1
  this.errors = {}
}

Plugin.prototype.onInput = function(err) {
  var stack = (err.stack.toString() || '').split('\n')
  var msg = util.format('%s: %s', err.stage, stack.shift())
  if (this.errors[msg] === undefined) {
    this.errors[msg] = []
  }
  this.errors[msg].push(stack.slice(0, this.stackDepth))
}

Plugin.prototype.start = function() {
  setInterval(this.run.bind(this), this.interval * 1000)
}

Plugin.prototype.stop = function(cb) {
  this.run()
  cb()
}

Plugin.prototype.run = function() {
  var total = 0
  var errors = this.errors
  this.errors = {} // Do this shortly after capturing errors to try to avoid race.
  for (var msg in errors) {
    // Just sample the first error for now and hope it's representative enough.
    var stack = errors[msg][0]
    var count = errors[msg].length
    total += count
    this.emitEvent({
      type: 'error',
      message: msg,
      ts: moment.utc(),
      severity: 3,
      stack: stack,
      count: count
    })
  }
  this.emitStats({errors: total})
}

module.exports = Plugin
