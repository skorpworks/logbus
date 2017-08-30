'use strict'

// Delete `fields` (array) from events.

function Plugin(config) {
  if (config.fields === undefined) {
    throw Error('`fields` to drop not defined')
  }
  this.fields = config.fields
}

Plugin.prototype.onInput = function(data) {
  try {
    var copy = {}
    for (var field of Object.keys(data)) {
      if (this.fields.indexOf(field) === -1) {
        copy[field] = data[field]
      }
    }
    this.emitEvent(copy)
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
