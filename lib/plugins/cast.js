'use strict'

// Convert `fields` ({name: type}):
//
// - int: integer
// - float: real number
// - bool: boolean
// - ts-sec: a timestamp from a seconds since epoch
// - ts-msec: a timestamp from a milliseconds since epoch
// - ts-usec: a timestamp from a microseconds since epoch

var moment = require('moment')

function Plugin(config) {
  if (config.fields === undefined) {
    throw new Error('`fields` to cast not defined')
  }
  this.fields = config.fields
}

Plugin.prototype.onInput = function(data) {
  try {
    var copy = Object.assign({}, data)
    for (var field in this.fields) {
      var val = copy[field]
      if (val === undefined) {
        continue
      }
      var type = this.fields[field]
      switch (type) {
      case 'int':
        val = parseInt(val)
        break
      case 'float':
        val = parseFloat(val)
        break
      case 'bool':
        val = val == true
        break
      case 'ts-usec':
        val = moment.unix(parseInt(val) / 1000000)
        break
      case 'ts-msec':
        val = moment.unix(parseInt(val) / 1000)
        break
      case 'ts-sec':
        val = moment.unix(parseFloat(val))
        break
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
