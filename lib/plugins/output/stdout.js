'use strict'

// Emit events to stdout.

function Plugin(config) {
  this.outChannels = []
  this.encoding = config.encoding || 'utf8'
}

Plugin.prototype.onInput = function(event) {
  try {
    console.log(event)
    this.emitStats({bytes_out: Buffer.byteLength(event, this.encoding)})
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
