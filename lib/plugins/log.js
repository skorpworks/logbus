'use strict'

// Log events.  Does not emit anything.

var HOSTNAME = require('os').hostname()

function Plugin(config) {
  this.outChannels = []
  this.extra = config.extra || {}
  this.defaultLevel = config.defaultLevel || 'info'
}

Plugin.prototype.onInput = function(data) {
  var log = Object.assign({}, this.extra, data)
  if (log.hostname === undefined) {
    // Without this, then bunyan thinks it invalid.
    log.hostname = HOSTNAME
  }
  var msg = data.msg || data.message
  delete log.message
  delete log.msg
  var level = log.level || log.severity || this.defaultLevel
  delete log.level
  if (typeof level === 'string') {
    level = level.toLowerCase()
  }
  var method = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal',
    1: 'fatal',
    2: 'fatal',
    3: 'error',
    4: 'warn',
    5: 'info',
    6: 'debug',
    7: 'trace',
    warning: 'warn',
    err: 'error'
  }[level] || level || 'info'
  if (this.log[method] === undefined) {
    method = 'error'
  }
  this.log[method](log, msg)
}

module.exports = Plugin
