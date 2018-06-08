'use strict'

// Parse kafka broker log output. To support the multiline messages, the event
// isn't emitted until start of a new message detected.
//
// Lines matching `parser[0]` will be considered start of new event. `parser` is
// an array with regex at position 0 and fields that match groups in the regex
// in the rest of the array. Default value is:
//
// [
//   '^\[([^\]]+)\]\s+(\S+)\s+(.+)$',
//   {name : 'ts', ts: true, format: 'YYYY-MM-DD hh:mm:ss,SSS'},
//   {name: 'severity'},
//   {name: 'message'},
// ]

const os = require('os')
const moment = require('moment')

function Plugin(config) {
  // Place for tracking current event metadata & previous lines.
  this.current = []
  // Will probably need to support other formats besides the default one.
  this.parser = config.parser || [
    /^\[([^\]]+)\]\s+(\S+)\s+(.+)$/,
    {name : 'ts', timestamp: 'YYYY-MM-DD hh:mm:ss,SSS'},
    {name: 'severity'},
    {name: 'message'},
  ]
}

Plugin.prototype.asEvent = function(lines) {
  // Return collected lines as a structured event.
  if (!lines.length) {
    return // first event has no prior
  }
  // First "line" is the structured event.
  const event = lines.shift()
  let m
  // Parse metadata from []'s.
  m = event.message.match(/^\[([^\]]+)\][:\s]*(.*)/)
  if (m) {
    event.extra = { message: '' }
    event.message = m[2]
    m[1].split(/\s+/).forEach((s) => {
      m = s.match(/(\S+)=([^,\s]+)/)
      if (m) {
        event.extra[m[1]] = m[2]
      }
      else {
        event.extra.message += `${s} `
      }
    })
  }
  // Per-partition msgs get spammy quick. Save partition as seperate field for
  // easier roll-ups in user's logbus pipeline.
  m = event.message.match(/(.* (of|for) partition.?) (\S+) (.*)/i)
  if (m) {
    event.partition = m[3]
    event.message = `${m[1]} X ${m[4]}`
  }
  // Handle multi-line msgs.
  if (lines.length) {
    if (lines[0].match(/Exception: /)) {
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
      event.message += '\n\n' + lines.map(i => i.trim()).join('\n')
    }
  }
  // Parse out the logger if it exists.
  m = event.message.match(/^([\s\S]+)\((.*)\)$/)
  if (m) {
    event.message = m[1].trim()
    event.logger = m[2]
  }
  return event
}

Plugin.prototype.onInput = function(line) {
  try {
    const match = line.match(this.parser[0])
    if (!match) {
      if (!this.current.length) {
        this.log.warn('ignoring initial, partial multi-line event', line)
      }
      else {
        this.current.push(line)
      }
      return
    }
    // Start of new message.  Copying current lines buffer in case of async.
    this.emitEvent(this.asEvent(this.current.slice(0)))
    let event = {
      host: os.hostname(),
    }
    this.current = [event]
    for (let pos = 1; pos < this.parser.length; pos++) {
      const field = this.parser[pos]
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
  this.emitEvent(this.asEvent(this.current.slice(0)))
  cb()
}

module.exports = Plugin
