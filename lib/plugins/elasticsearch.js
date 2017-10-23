'use strict'

// Parse elasticsearch log output. To support the multiline messages, the event
// isn't emitted until start of a new message detected.
//
// Lines matching `parser[0]` will be considered start of new event. `parser` is
// an array with regex at position 0 and fields that match groups in the regex
// in the rest of the array. Default value is:
//
// [
//   '^\[(\S+)\]\s*\[(\S+)\s*\]\s*\[(\S+)\]\s*(.+)$',
//   {name : 'ts', ts: true, format: 'YYYY-MM-DDThh:mm:ss,SSS'},
//   {name: 'severity'},
//   {name: 'logger'},
//   {name: 'message'},
// ]

var os = require('os')
var moment = require('moment')
var _ = require('lodash')

function Plugin(config) {
  // Place for tracking previous lines
  this.current = []
  // Will probably need to support other formats besides the default one.
  this.parser = config.parser || [
    /^\[([^\s\]]+)\s*\]\s*\[([^\s\]]+)\s*\]\s*\[([^\s\]]+)\s*\]\s*(.+)$/,
    {name : 'ts', timestamp: 'YYYY-MM-DDThh:mm:ss,SSS'},
    {name: 'severity'},
    {name: 'logger'},
    {name: 'message'},
  ]
}

Plugin.prototype.asEvent = function(lines) {
  // Return collected lines as a structured event.  Multiline events assumed to be exceptions.
  if (lines.length) {
    var event = lines.shift()
    if (lines.length) {
      if (lines[0].match(/(Exception|ElasticsearchException\$1): /)) {
        var parts = lines.shift().split(': ')
        event.exception = {
          type: parts.shift(),
          message: parts.join(': '),
          stack: [],
        }
        lines.forEach(function(line) {
          if (line.match(/^(Caused by|\s+at |\s+\.+\s+\d+ more)/)) {
            event.exception.stack.push(line)
          }
          else {
            event.exception.message += '\n' + line
          }
        })
      }
      else {
        event.message += '\n\n' + _.map(lines, i => i.trim()).join('\n')
      }
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
    var match = line.match(this.parser[0])
    if (!match) {
      // exception
      if (this.current.length > 0) {
        // Protect against starting mid-exception
        this.current.push(line)
      }
      return
    }
    // Start of new message.
    let newEvent = this.current.slice(0)
    let event = {
      host: os.hostname(),
    }
    this.current = [event]
    this.emitEvent(this.asEvent(newEvent))
    for (let pos = 1; pos < this.parser.length; pos++) {
      var field = this.parser[pos]
      if (field.timestamp) {
        event[field.name] = moment.utc(match[pos], field.timestamp)
      }
      else {
        event[field.name] = match[pos]
      }
    }
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.stop = function(cb) {
  this.emitEvent(this.asEvent(this.current))
  cb()
}

module.exports = Plugin
