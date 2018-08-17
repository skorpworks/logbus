'use strict'

// Parse elasticsearch log output. To support the multiline messages, the event
// isn't emitted until start of a new message detected.
//
// Lines matching `parser.regex` will be considered start of new event.
// `parser.fields` is an array of {name} records to label the corresponding
// group. Fields with `timestamp` will be parsed according to that format.
// The default value is:
//
// {
//   regex: /^\[(\S+)\]\s*\[(\S+)\s*\]\s*\[(\S+)\]\s*(.+)$/,
//   fields: [
//     {name : 'ts', timestamp: 'YYYY-MM-DDThh:mm:ss,SSS'},
//     {name: 'severity'},
//     {name: 'logger'},
//     {name: 'message'},
//   ],
// }

var os = require('os')
var moment = require('moment')
var _ = require('lodash')

function Plugin(config) {
  // Place for tracking previous lines
  this.current = []
  // Will probably need to support other formats besides the default one.
  this.parser = config.parser || {
    regex: /^\[([^\s\]]+)\s*\]\s*\[([^\s\]]+)\s*\]\s*\[([^\s\]]+)\s*\]\s*(.+)$/,
    fields: [
      {name : 'ts', timestamp: 'YYYY-MM-DDThh:mm:ss,SSS'},
      {name: 'severity'},
      {name: 'logger'},
      {name: 'message'},
    ],
  }
}

Plugin.prototype.asEvent = function(lines) {
  // Return collected lines as a structured event.  Multiline events assumed to be exceptions.
  if (lines.length) {
    const event = lines.shift()
    let m = event.message.match(/shard id \[\[([^\]]+)\]\[(\d+)\]\]/)
    if (m) {
      event.index = m[1]
      event.shard = parseInt(m[2])
    }
    if (lines.length) {
      if (lines[0].match(/Exception(\$1)?: /)) {
        const parts = lines.shift().split(': ')
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
    var match = line.match(this.parser.regex)
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
    this.parser.fields.forEach((field, pos) => {
      if (field.timestamp) {
        event[field.name] = moment.utc(match[pos + 1], field.timestamp)
      }
      else {
        event[field.name] = match[pos + 1]
      }
    })
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
