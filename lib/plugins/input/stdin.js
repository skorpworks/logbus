'use strict'

// Read stdin and emit text assumed to be encoded with `encoding` as blocks of
// text. Throttle reading at `maxMbps`. Will shut down the pipeline unless
// `stopOnEOF` is false.

var split = require('split2')
var Throttle = require('stream-throttle').Throttle

function Plugin(config) {
  this.encoding = config.encoding || 'utf8'
  this.maxMbps = config.maxMbps || 100
  this.stopOnEOF = config.stopOnEOF !== undefined ? config.stopOnEOF : true
}

Plugin.prototype.start = function() {
  var self = this
  var stream = process.stdin.pipe(new Throttle({rate: self.maxMbps << 20})).pipe(split())

  if (self.stopOnEOF) {
    stream.on('end', function() {
      self.pipeline.emit('SIGTERM', 'stdin closed')
    })
  }
  stream.on('data', function(data) {
    self.emitEvent(data)
    self.emitStats({bytes_in: Buffer.byteLength(data, self.encoding)})
  })
  stream.on('error', function(err) {
    this.emitError(err)
  })
}

module.exports = Plugin
