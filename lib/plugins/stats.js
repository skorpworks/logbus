'use strict'

// Emit aggregated stats every `interval` seconds. The following attributes are
// honored by stages emitting to the stats channel:
//
// - errors: number of errors
// - events_in: number of events ingested
// - events_out: number of events shipped
// - bytes_in: bytes received
// - bytes_out: bytes shipped
// - lines_in: lines processed
// - lines_out: lines emitted

const moment = require('moment')
const util = require('util')

function Plugin(config) {
  this.interval = config.interval || 15
  if (config.enable === undefined) {
    config.enable = {}
  }
  this.enable = {
    memory: config.enable.memory !== undefined ? config.enable.memory : true,
    rates: config.enable.rates !== undefined ? config.enable.rates : false
  }
  this.reset()
}

Plugin.prototype.onInput = function(data) {
  try {
    if (data.errors) {
      this.errors += data.errors
    }
    if (data.events_in) {
      this.events_in += data.events_in
    }
    if (data.events_out) {
      this.events_out += data.events_out
    }
    if (data.bytes_in) {
      this.bytes_in += data.bytes_in
    }
    if (data.bytes_out) {
      this.bytes_out += data.bytes_out
    }
    if (data.lines_in) {
      this.lines_in += data.lines_in
    }
    if (data.lines_out) {
      this.lines_out += data.lines_out
    }
  }
  catch (err) {
    // TODO: Potential for negative feedback loop: errors -> stats -> errors
    this.emitError(err)
  }
}

Plugin.prototype.reset = function() {
  this.begin = moment.utc()
  this.errors = 0
  this.events_in = 0
  this.events_out = 0
  this.bytes_in = 0
  this.bytes_out = 0
  this.lines_in = 0
  this.lines_out = 0
}

Plugin.prototype.start = function() {
  setInterval(this.run.bind(this), this.interval * 1000)
}

Plugin.prototype.stop = function(cb) {
  this.run()
  cb()
}

Plugin.prototype.run = function() {
  var stats = {
    type: 'stats',
    ts: moment.utc(),
    errors: this.errors,
    bytes_in: this.bytes_in,
    bytes_out: this.bytes_out,
    lines_in: this.lines_in,
    lines_out: this.lines_out,
    events_in: this.events_in,
    events_out: this.events_out
  }
  this.reset()  // Do this shortly after capturing to try to avoid race.
  stats.message = util.format('errors[%d] events[in=%d out=%d] lines[in=%d out=%d] mbytes[in=%d out=%d]',
                              stats.errors, stats.events_in, stats.events_out, stats.lines_in, stats.lines_out, stats.bytes_in >> 20, stats.bytes_out >> 20)
  if (this.enable.memory) {
    var mem = process.memoryUsage()
    stats.heapMB = Math.round(mem.heapUsed >> 20)
    stats.rssMB = Math.round(mem.rss >> 20)
  }
  if (this.enable.rates) {
    var duration = (moment.utc() - this.begin) / 1.0 // not sure why divide-by-1.0 is needed
    stats.rate = {
      errors: Math.round(stats.errors / duration),
      events_in: Math.round(stats.events_in / duration),
      events_out: Math.round(stats.events_out / duration),
      bytes_in: Math.round(stats.bytes_in / duration),
      bytes_out: Math.round(stats.bytes_out / duration),
      lines: Math.round(stats.lines / duration)
    }
  }
  // May not get consumed if we're stopped since stats is a special stage.
  this.emitEvent(stats)
}

module.exports = Plugin
