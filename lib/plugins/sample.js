'use strict'

// Emit event every `nth` sample and/or every `interval` seconds.

function Plugin(config) {
  if (config.interval !== undefined) {
    this.interval = config.interval
  }
  this.nth = config.nth || 10
  this.count = 0
  this.sample = null
}

Plugin.prototype.onInput = function(event) {
  try {
    this.sample = event
    if (this.count % this.nth === 0) {
      this.run()
    }
    // Increment after so that first one gets sampled.
    this.count++
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.start = function() {
  if (this.interval) {
    setInterval(this.run.bind(this), this.interval * 1000)
  }
}

Plugin.prototype.run = function() {
  if (this.sample) {
    // Don't sample the same event multiple times.
    var event = this.sample
    this.sample = null
    this.emitEvent(event)
  }
}

module.exports = Plugin
