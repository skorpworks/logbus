'use strict'

// Rename field names according to `fields` ({old: new}) mapping.

function Plugin(config) {
  if (config.fields === undefined) {
    throw Error('`fields` to rename not defined')
  }
  this.fields = config.fields
}

Plugin.prototype.onInput = function(event) {
  try {
    var copy = {}
    for (var field of Object.keys(event)) {
      var name = this.fields[field] || field
      copy[name] = data[field]
    }
    this.emitEvent(copy)
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
