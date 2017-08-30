'use strict'

// Emit msg formated as JSON with `indent` indentation level. When `sort` set,
// the output will be sorted shallowly - WARNING: nested objects will be lost
// until a deep sort is supported.

function Plugin(config) {
  this.indent = config.indent || 2
  this.sort = config.sort !== undefined ? config.sort : false
}

Plugin.prototype.onInput = function(data) {
  try {
    var sort = null
    if (this.sort) {
      sort = Object.keys(data).sort()
    }
    this.emitEvent(JSON.stringify(data, sort, this.indent) + '\n')
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
