'use strict'

// Emit events to stdout.

const fs = require('fs')
const moment = require('moment')

function Plugin(config) {
  this.outChannels = []
  if (config.path === undefined) {
    throw new Error('`path` to write to not defined')
  }
  this.path = config.path
  this.encoding = config.encoding || 'utf8'
  this.quietTime = config.quietTime || 1000
  this.outstanding = 0
}

Plugin.prototype.start = function() {
  this.file = fs.openSync(this.path, 'w')
}

Plugin.prototype.stop = function(cb) {
  var self = this
  self.timer = setInterval(function() {
    if (self.outstanding === 0) {
      clearInterval(self.timer)
      fs.closeSync(self.file)
      cb()
    }
    else {
      self.log.debug(self.outstanding, 'outstanding writes')
    }
  }, self.quietTime / 3)
}

Plugin.prototype.onInput = function(data) {
  try {
    var self = this
    self.lastWrite = moment.utc()
    self.outstanding++
    fs.write(this.file, data, null, this.encoding, function(err, written, buffer) {
      self.outstanding--
      if (err) {
        self.emitError(err)
      }
      self.emitStats({events_out: 1, bytes_out: written})
    })
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
