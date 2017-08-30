'use strict'

// Force a garbage collection every `interval` seconds. A msg indicating that
// the collection is finished is emitted.

function Plugin(config) {
  this.interval = config.interval || 60
}

Plugin.prototype.start = function() {
  if (global.gc) {
    setInterval(this.run.bind(this), this.interval * 1000)
  }
}

Plugin.prototype.run = function() {
  var start = moment.utc()
  global.gc()
  var msg = {
    msg: 'garbage collected',
    duration: moment.utc() - start 
  }
  this.emitEvent(msg)
}

module.exports = Plugin
