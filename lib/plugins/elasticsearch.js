'use strict'

// Parse elasticsearch log output. To support the multiline msgs, the event
// isn't emitted until start of a new msg detected.

var os = require('os')
var moment = require('moment')
var _ = require('lodash')

function Plugin(config) {
  // Place for tracking previous lines
  this.current = []
  // Will probably need to support other formats besides the default one.
}

Plugin.prototype.asEvent = function() {
  // Return collected lines as a structured event.  Multiline events assumed to be exceptions.
  if (this.current.length) {
    var event = this.current.shift()
    if (this.current.length) {
      var exc = this.current.shift().split(':', 2)
      event.exception = {
        type: exc[0],
        msg: exc[1]
      }
      event.stack = _.map(this.current, i => i.trim()).join('\n')
    }
    return event
  }
}

Plugin.prototype.onInput = function(line) {
  try {
    if (line.match(/^\s/)) {
      // stack trace
      if (this.current.length > 0) {
        // Protect against starting mid-exception
        this.current.push(line)
      }
      return
    }
    var m = line.match(/^\[(\S+)\]\[(\S+)\s*\]\[(\S+)\] \[(\S+)\] (.+)$/)
    if (!m) {
      // exception
      if (this.current.length > 0) {
        // Protect against starting mid-exception
        this.current.push(line)
      }
      return
    }
    // Start of new message.
    this.emitEvent(this.asEvent())
    var event = {}
    event.ts = moment.utc(m[1], 'YYYY-MM-DDThh:mm:ss,SSS')
    event.severity = m[2]
    event.logger = m[3]
    event.node = m[4]
    event.msg = m[5]
    event.host = os.hostname()
    this.current = [event]
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.stop = function(cb) {
  this.emitEvent(this.asEvent())
  cb()
}

module.exports = Plugin
