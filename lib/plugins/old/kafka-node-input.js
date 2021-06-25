/* eslint-disable */

// WARNING: This plugin is alpha quality.  The librd one takes priority.

// Read from Kafka `topic` every `fetchWaitSeconds` indefinitely or until ``

var kafka = require('kafka-node')

function Plugin(config) {
  if (!config.topic) {
    throw new Error('undefined config: topic')
  }
  this.topic = config.topic
  this.exitAfterSeconds = config.exitAfterSeconds
  var options = {
    groupId: config.groupId || 'logbus',
    fromOffset: config.offset || 'latest',
    protocol: ['roundrobin'],
    autoCommit: false,
    fetchMaxWaitMs: 1000 * (config.fetchWaitSeconds || 1),
    // 'compression.codec': {none: 0, gzip: 1, snappy: 2}[config.compression || 'none'],
  }
  if (config.format === 'json') {
    this.parse = JSON.parse
    options.encoding = 'buffer'
  }
  else {
    this.parse = i => i
  }
  var client = {
    kafkaHost: 'localhost:9092',
    autoConnect: false
  }
  if (config.hosts !== undefined) {
    options.host = config.hosts.join(',')
    client.host = config.hosts.join(',')
  }
  this.client = new kafka.KafkaClient(client)
  this.consumer = new kafka.Consumer(this.client, [{topic:this.topic}], options)
  this.consumer.on('error', this.onError.bind(this))
  this.consumer.on('message', this.onMessage.bind(this))
  this.resetExitTimer()
}

Plugin.prototype.resetExitTimer = function() {
  this.tsLastMsg = new Date().getTime() / 1000
}

Plugin.prototype.onError = function(err) {
  if (this.consumer.ready) {
    this.emitError(err)
  }
}

Plugin.prototype.onMessage = function(msg) {
  try {
    this.log.debug('msg', {size: msg.value.length, partition: msg.partition, offset: msg.offset})
    this.emitEvent(this.parse(msg.value))
    this.resetExitTimer()
    this.emitStats({events_in: 1, bytes_in: msg.value.length})
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.start = function() {
  this.client.connect()
  if (this.exitAfterSeconds != null) {
    setInterval(this.checkTopicEnd.bind(this), 500)
  }
}

Plugin.prototype.stop = function(cb) {
  this.consumer.close(true, cb)
}

Plugin.prototype.checkTopicEnd = function() {
  var now = new Date().getTime() / 1000
  if (now - this.tsLastMsg > this.exitAfterSeconds) {
    this.pipeline.emit('SIGTERM', 'at end of kafka topic')
  }
}

module.exports = Plugin
