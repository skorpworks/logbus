'use strict'

// WARNING: This plugin is alpha quality.

// Read from Kafka `topics` as consumer group `group` (default=logbus) using
// `compression` (none[default], gzip, snappy) in `size` (default=100) batches
// every `interval` milliseconds (default=10000). Start at `offset`
// (default=latest) when no offset defined for this consumer group. When
// `exitAfterSeconds` is defined, shut down the pipeline once that many seconds
// have passed before consuming a new message from any of the topics. Messages
// can be deserialized here via `format` (none[default], json).

// TODO:
// - configuration to control where to start from.
// - figure out when to commit offset. Immediately and assume will make it
//   downstream? Wait for some signal downsstream that events made it?

var kafka = require('node-rdkafka')

function Plugin(config) {
  if (!config.topics) {
    throw new Error('undefined config: topics')
  }
  this.interval = config.interval || 10000
  this.size = config.size || 100
  this.topics = config.topics
  this.exitAfterSeconds = config.exitAfterSeconds
  var options = {
    'metadata.broker.list': 'localhost:9092',
    'group.id': config.groupId || 'logbus',
    'compression.codec': config.compression || 'none',
    'event_cb': true,
    // 'rebalance_cb': true, // HERE BE DRAGONS!
    'enable.auto.commit': true,
    // 'statistics.interval.ms': 60000,
  }
  if (config.hosts !== undefined) {
    options['metadata.broker.list'] = config.hosts.join(',')
  }
  if (config.format === 'json') {
    this.parse = JSON.parse
  }
  else {
    this.parse = i => i
  }
  if (config.debug != null) {
    // Useful for consumers: 'cgrp,topic,fetch'
    // Full list: generic, broker, topic, metadata, queue, msg, protocol, cgrp, security, fetch, feature, interceptor, plugin, all
    options.debug = config.debug
  }
  var topicOptions = {
    'auto.offset.reset': 'latest',
  }
  if (config.offset != null) {
    topicOptions['auto.offset.reset'] = config.offset
  }
  this.consumer = new kafka.KafkaConsumer(options, topicOptions)
  this.consumer.on('ready', this.onReady.bind(this))
  this.consumer.on('data', this.onData.bind(this))
  this.consumer.on('event.log', this.onLog.bind(this))
  this.consumer.on('event.error', this.onError.bind(this))
  this.consumer.on('rebalance', this.onRebalance.bind(this))
  // this.producer.on('event.stats', this.onStats.bind(this))
  this.resetExitTimer()
}

Plugin.prototype.start = function() {
  this.consumer.connect()
}

Plugin.prototype.stop = function(cb) {
  if (this.consuming) {
    clearInterval(this.consuming)
  }
  this.consumer.unsubscribe()
  this.consumer.disconnect(cb)
  // Thought disconnect() could use some delay after unsubscribe() but doesn't seem to matter.
  // var that = this
  // setTimeout(event => that.consumer.disconnect(cb), 100)
}

Plugin.prototype.onReady = function(options) {
  this.log.info('ready to consume', options)
  this.consumer.subscribe(this.topics)
  this.consumer.consume()
  // Would like to control consumption rate & batch size but this tells a poor shutdown story.
  // var that = this
  // this.consuming = setInterval(event => {
  //   that.consumer.consume(100, that.onConsumption.bind(that))
  // }, this.interval)

  if (this.exitAfterSeconds != null) {
    this.endCheck = setInterval(this.checkTopicEnd.bind(this), 500)
  }
}

Plugin.prototype.checkTopicEnd = function() {
  var now = new Date().getTime() / 1000
  if (now - this.tsLastMsg > this.exitAfterSeconds) {
    this.pipeline.emit('SIGTERM', 'at end of kafka topics')
    clearInterval(this.endCheck)
  }
}

Plugin.prototype.onLog = function(event) {
  // severity=7 always?  Kewl!
  const method = {
    1: 'fatal',
    2: 'fatal',
    3: 'error',
    4: 'warn',
    5: 'info',
    6: 'debug',
    7: 'trace',
  }
  this.log[method[event.severity] || 'warn'](event.fac, event.message)
}

Plugin.prototype.onError = function(err) {
  if (this.consumer.ready) {
    this.emitError(err)
  }
}

Plugin.prototype.onRebalance = function(event) {
  // Just log for now so we can know when it happens. May need to do something
  // else if default rebalance algorithm too derpy.
  this.log.warn(event.message)
}

// Disabled statistics until find something would like to `emitStats()` for.  Reference:
//
//   https://github.com/edenhill/librdkafka/wiki/Statistics
//
// Plugin.prototype.onStats = function(stats) {
//   this.emitStats({events_in: stats.msg_cnt, bytes_in: stats.size})
// }

Plugin.prototype.onConsumption = function(err, events) {
  if (err) {
    this.emitError(err)
  }
  else {
    events.forEach(event => {
      try {
        this.log.debug('event', {size: event.value.length, partition: event.partition, offset: event.offset})
        this.emitEvent(this.parse(event.value))
        this.resetExitTimer()
        this.emitStats({events_in: 1, bytes_in: event.value.length})
      }
      catch (err) {
        this.emitError(err)
      }
    })
  }
}

Plugin.prototype.onData = function(event) {
  try {
    this.log.debug('event', {size: event.value.length, partition: event.partition, offset: event.offset})
    this.emitEvent(this.parse(event.value))
    this.resetExitTimer()
    this.emitStats({events_in: 1, bytes_in: event.value.length})
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.resetExitTimer = function() {
  this.tsLastMsg = new Date().getTime() / 1000
}

module.exports = Plugin
