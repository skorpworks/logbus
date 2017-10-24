'use strict'

// Read from Kafka `topic` ...

// TODO: Configuration to control where to start from.

// TODO: Figure out when to commit offset. Immediately and assume will make it
// downstream? Wait for some signal downsstream that events made it?


var kafka = require("node-rdkafka")
var sizeof = require('object-sizeof')
var lodash = require('lodash')

function Plugin(config) {
  if (!config.topic) {
    throw new Error('undefined config: topic')
  }
  this.topic = config.topic
  this.exitAfterSeconds = config.exitAfterSeconds
  var options = {
    'debug': 'all',
    'metadata.broker.list': 'localhost:9092',
    'group.id': config.groupId || 'logbus',
    'enable.auto.commit': false,
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
  this.consumer = new kafka.KafkaConsumer(options, {'auto.offset.reset': 'earliest'})
  this.consumer.on('event.error', this.onError.bind(this))
  this.consumer.on('data', this.onData.bind(this))
  this.consumer.on('ready', this.onReady.bind(this))
  this.consumer.on('event.log', this.onLog.bind(this))
  this.resetExitTimer()
}

Plugin.prototype.start = function() {
  this.consumer.connect()
}

Plugin.prototype.stop = function(cb) {
  if (this.consuming) {
    clearInterval(this.consuming)
  }
  this.consumer.disconnect(cb)
}

Plugin.prototype.onReady = function(options) {
  this.log.info('ready to consume', options)
  this.consumer.subscribe([this.topic])
  this.consumer.consume()
  // this.consuming = setInterval(this.consumer.consume.bind(this.consumer), 1000)

  if (this.exitAfterSeconds != null) {
    setInterval(this.checkTopicEnd.bind(this), 500)
  }
}

Plugin.prototype.checkTopicEnd = function() {
  var now = new Date().getTime() / 1000
  if (now - this.tsLastMsg > this.exitAfterSeconds) {
    this.pipeline.emit('SIGTERM', 'at end of kafka topic')
  }
}

Plugin.prototype.onLog = function(msg) {
  var method = {
    7: 'trace',
    6: 'debug',
    5: 'info',
    4: 'warn',
    3: 'error',
    2: 'fatal',
  }[msg.severity] || 'warn'
  this.log[method](msg)
}

Plugin.prototype.onError = function(err) {
  if (this.consumer.ready) {
    this.emitError(err)
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
