'use strict'

// Mutate events so that only specific fields are preserved. The `fields`
// mapping can take one of two forms:
//
//  new-field-name: field-name
//
// or
//
//   new-field-name: ['1st-field', '2nd-field', 'last-field]
//
// With the latter form, the first field in the array with a *defined* value
// (null, 0, false is considered defined) will be used.

function Plugin(config) {
  if (config.fields === undefined) {
    throw Error('`fields` to keep not defined')
  }
  this.fields = {}
  for (var field in config.fields) {
    var src = config.fields[field]
    if (typeof src === 'string') {
      src = [src]
    }
    this.fields[field] = src
  }
}

Plugin.prototype.onInput = function(data) {
  try {
    var copy = {}
    for (var field in this.fields) {
      var val = null
      for (var src of this.fields[field]) {
        if (data[src] !== undefined) {
          val = data[src]
          break
        }
      }
      copy[field] = val
    }
    this.emitEvent(copy)
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
