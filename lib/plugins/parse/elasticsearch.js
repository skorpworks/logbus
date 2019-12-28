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

const os = require('os')
const moment = require('moment')
const _ = require('lodash')

module.exports = (config, logbus) => {
  // Place for tracking previous lines
  let current = []
  // Will probably need to support other formats besides the default one.
  const parser = config.parser || {
    regex: /^\[([^\s\]]+)\s*\]\s*\[([^\s\]]+)\s*\]\s*\[([^\s\]]+)\s*\]\s*(.+)$/,
    fields: [
      {name : 'ts', timestamp: 'YYYY-MM-DDThh:mm:ss,SSS'},
      {name: 'severity'},
      {name: 'logger'},
      {name: 'message'},
    ],
  }

  function asEvent(lines) {
    // Return collected lines as a structured event.  Multiline events assumed to be exceptions.
    if (lines.length) {
      const event = lines.shift()
      const m = event.message.match(/shard id \[\[([^\]]+)\]\[(\d+)\]\]/)
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
          lines.forEach((line) => {
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

  function onInput(line) {
    try {
      if (line.match(/^\s/)) {
        // stack trace
        if (current.length > 0) {
          // Protect against starting mid-exception
          current.push(line)
        }
        return
      }
      const match = line.match(parser.regex)
      if (!match) {
        // exception
        if (current.length > 0) {
          // Protect against starting mid-exception
          current.push(line)
        }
        return
      }
      // Start of new message.
      const newEvent = current.slice(0)
      const event = {
        host: os.hostname(),
      }
      current = [event]
      logbus.event(asEvent(newEvent))
      parser.fields.forEach((field, pos) => {
        if (field.timestamp) {
          event[field.name] = moment.utc(match[pos + 1], field.timestamp)
        }
        else {
          event[field.name] = match[pos + 1]
        }
      })
    }
    catch (err) {
      logbus.error(err)
    }
  }

  function stop() {
    logbus.event(asEvent(current))
  }

  return { onInput, stop }
}
