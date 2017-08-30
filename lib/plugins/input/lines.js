'use strict'

// Emit text as individual lines.  Lines greater than `maxSize` will be truncated.

function Plugin(config) {
  this.encoding = config.encoding || 'utf8'
  this.maxSize =  config.maxSize || 64 << 10
  this.buffer = ''
}

Plugin.prototype.onInput = function(txt) {
  try {
    var lines = (this.buffer + txt).split('\n')
    this.buffer = lines.pop()
    for (var line of lines) {
      if (Buffer.byteLength(line, this.encoding) > this.maxSize) {
        var truncated = new Buffer(this.maxSize)
        truncated.write(line)
        line = truncated.toString()
      }
      if (line) {
        this.emitEvent(line)
      }
    }
    this.emitStats({lines_in: lines.length})
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
