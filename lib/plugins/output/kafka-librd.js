'use strict'

// Send to Kafka `topic` every `interval` seconds.
//
// No events will be emitted on `outChannels`.

// TODO:
// - event specific topics by allowing topic to be a stage-defined function
// - sending timestamp
// - parition options
// - key options

var kafka = require("node-rdkafka")
var sizeof = require('object-sizeof')
var lodash = require('lodash')

function Plugin(config) {
  this.interval = config.interval || 10
  this.ready = false
  if (!config.topic) {
    throw new Error('undefined config: topic')
  }
  this.topic = config.topic
  this.buffer = []
  var options = {
    'metadata.broker.list': 'localhost:9092',
    'statistics.interval.ms': 1000,
    'dr_cb': true,
  }
  if (config.hosts !== undefined) {
    options['metadata.broker.list'] = config.hosts.join(',')
  }
  this.producer = new kafka.Producer(options)
  this.producer.on('ready', this.onReady.bind(this))
  this.producer.on('event.error', this.onError.bind(this))
  // Since stats callback not exposed, this is best hook for us to know what's really happening.
  this.producer.on('delivery-report', this.onStats.bind(this))
  // Keep track of what unshipped events so we can try to make sure gets flushed on shutdown.
  this.rx = 0
  this.tx = 0
}

Plugin.prototype.onStats = function(err, report) {
  if (err) {
    this.emitError(err)
  }
  else {
    this.tx++
    this.log.debug('delivery report', report)
  }
}

Plugin.prototype.onReady = function() {
  this.ready = true
  this.log.info('connected, ready to send')
  this.flushBuffer()
  this.producer.setPollInterval(100)
}

Plugin.prototype.onError = function(err) {
  this.emitError(err)
}

Plugin.prototype.onInput = function(event) {
  this.rx++
  if (!this.ready) {
    this.log.debug('kafka connection not ready, buffering event')
    this.buffer.push(event)
    return
  }
  this.produce(event)
  this.emitStats({events_out: 1, bytes_out: sizeof(event)})
}

Plugin.prototype.shipEvent = function(event) {
  try {
    this.producer.produce(
      this.topic,
      null, // partition
      new Buffer(event),
      null // key
      // new Date().getTime() / 1000
    )
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.start = function() {
  this.producer.connect(this.onReady.bind(this))
}

Plugin.prototype.stop = function(cb) {
  if (!this.ready) {
    this.log.warn('stopped yet still not ready, re-scheduling last run')
    setTimeout(lodash.partial(this.stop, cb).bind(this), 1000)
  }
  else {
    // Send any events that we may have buffered then tell the kafka client to
    // flush whatever it may have buffered. Will make best effort to flush until
    // tx=rx or timed out on shutdown.
    this.flushBuffer()
    var self = this
    this.producer.flush(1000, function() {
      if (self.tx >= self.rx) {
        cb()
      }
      else {
        self.log.warn('unshipped events, reflushing', {count: self.rx - self.tx})
        setTimeout(lodash.partial(self.stop, cb).bind(self), 1000)
      }
    })
  }
}

Plugin.prototype.flushBuffer = function() {
  if (!this.ready) {
    this.log.warn('kafka connection not ready', {buffered: this.buffer.length})
    return
  }
  // Save a copy so can continue buffering while sending.
  var buffer = this.buffer
  if (buffer.length) {
    this.log.info('flushing buffered messages', {count: buffer.length})
    this.buffer = []
    buffer.forEach(this.shipEvent.bind(this))
    this.emitStats({events_out: buffer.length, bytes_out: sizeof(buffer)})
  }
}

module.exports = Plugin
