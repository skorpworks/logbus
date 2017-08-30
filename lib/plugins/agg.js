'use strict'

// Emit an aggregated event for all events between `start` and `stop`.

const os = require('os')

function Plugin(config) {
  this.buckets = {}
  this.tsField = config.tsField || 'ts'
  if (typeof(config.filtered) !== 'function') {
    throw new Error('`filtered` function not defined')
  }
  if (typeof(config.start) !== 'function') {
    throw new Error('`start` function not defined')
  }
  if (typeof(config.stop) !== 'function') {
    throw new Error('`stop` function not defined')
  }
  if (typeof(config.key) !== 'function') {
    throw new Error('`key` function not defined')
  }
  if (typeof(config.view) !== 'function') {
    throw new Error('`view` function not defined')
  }
  var sandbox = {
    math: Math,
    hostname: os.hostname(),
    config: config,
    util: require('util'),
    moment: require('moment')
  }
  this.filtered = config.filtered.bind(sandbox)
  // Avoid name clash with Plugin.start() & Plugin.stop()
  this.startBucket = config.start.bind(sandbox)
  this.stopBucket = config.stop.bind(sandbox)
  this.key = config.key.bind(sandbox)
  this.view = config.view.bind(sandbox)
  if (typeof(config.maxSize) === 'function') {
    this.maxSize = config.maxSize(sandbox)
  }
  else {
    this.maxSize = function(event) {
      return event._agg && event._agg.maxSize || config.maxSize || 1000
    }
  }
  if (typeof(config.maxEventSeconds) === 'function') {
    this.maxEventSeconds = config.maxEventSeconds(sandbox)
  }
  else {
    this.maxEventSeconds = function(event) {
      return event._agg && event._agg.maxEventSeconds || config.maxEventSeconds || 300
    }
  }
  if (typeof(config.maxRealSeconds) === 'function') {
    this.maxRealSeconds = config.maxRealSeconds(sandbox)
  }
  else {
    this.maxRealSeconds = function() {
      return config.maxRealSeconds || 300
    }
  }
}

Plugin.prototype.onInput = function(data) {
  try {
    if (this.filtered(data)) {
      return
    }
    var key = this.key(data)
    if (this.buckets[key] !== undefined) {
      this.buckets[key].push(data)
      if (this.stopBucket(data)) {
        this.run([key])
      }
      else if (this.buckets[key].length >= this.maxSize(data)) {
        this.run([key])
      }
      else if ((data[this.tsField] - this.buckets[key][0][this.tsField]) >= this.maxEventSeconds(data) * 1000) {
        this.run([key], {timedOut: true})
      }
    }
    else {
      if (this.startBucket(data)) {
        this.buckets[key] = [data]
      }
    }
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.start = function() {
  setTimeout(this.run.bind(this), this.maxRealSeconds() * 1000)
}

Plugin.prototype.stop = function(cb) {
  this.run()
  cb()
}

Plugin.prototype.run = function(keys, opts) {
  opts = Object.assign({timedOut: false}, opts)
  if (keys === undefined) {
    keys = Object.keys(this.buckets)
  }
  for (var key of keys) {
    try {
      var next
      if (opts.timedOut) {
        // The last one probably doesn't belong, especially when aggregating cron jobs.
        next = this.buckets[key].pop()
      }
      var event = this.view(this.buckets[key])
      if (event) {
        this.emitEvent(event)
      }
      delete this.buckets[key]
      if (next) {
        this.buckets[key] = [next]
      }
    }
    catch (err) {
      this.emitError(err)
    }
  }
}

module.exports = Plugin
