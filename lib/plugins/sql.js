'use strict'

// Emit event for every row returned by `query` operating on events buffered
// until `interval` seconds or `bufferSize` reached, whichever comes first.

var alasql = require('alasql')

function Plugin(config) {
  this.buffer = []
  this.bufferSize = config.bufferSize || 10000
  this.interval = config.interval || 60
  this.query = alasql.compile(config.query)
}

Plugin.prototype.onInput = function(data) {
  try {
    this.buffer.push(data)
    if (this.buffer.length > this.bufferSize) {
      this.run()
    }
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.start = function() {
  setInterval(this.run.bind(this), this.interval * 1000)
}

Plugin.prototype.stop = function(cb) {
  this.run()
  cb()
}

Plugin.prototype.run = function() {
  // Save a copy so can continue buffering while indexing.
  var buffer = this.buffer
  this.buffer = []
  if (buffer.length) {
    try {
      var result = this.query([buffer])
      for (var row of result) {
        this.emitEvent(row)
      }
    }
    catch (err) {
      this.emitError(err)
    }
  }
}

module.exports = Plugin
