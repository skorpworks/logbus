'use strict'

// Send to Kafka `topic` every `interval` seconds or once `bufferSize` msgs are
// ready to send.
//
// Kafka responses from the send operations will be emitted on `outChannels` as:
//
//   { TOPIC: { PARTIION: OFFSET } }

var kafka = require('kafka-node')
var fs = require('fs')
var sizeof = require('object-sizeof')
var lodash = require('lodash')

function Plugin(config) {
  this.bufferSize = config.bufferSize || 1000
  this.interval = config.interval || 60
  this.ready = false
  if (!config.topic) {
    throw new Error('undefined config: topic')
  }
  this.topic = config.topic
  this.buffer = []
  var client = {
    kafkaHost: 'localhost:9092',
    autoConnect: false
  }
  if (config.hosts !== undefined) {
    client.kafkaHost = config.hosts.join(',')
  }
  this.client = new kafka.KafkaClient(client)
  this.producer = new kafka.HighLevelProducer(this.client)
  var wtf = this.onReady.bind(this)
  this.producer.on('ready', function() { wtf() })
  this.producer.on('error', this.onError.bind(this))
  this.onResponse = this.onResponse.bind(this)
}

Plugin.prototype.onReady = function(a, b, c) {
  this.ready = true
  var that = this
  this.producer.createTopics([this.topic], false, function (err, data) {
    if (err) {
      that.emitError(err)
    }
  })
  this.log.info('connected, ready to send')
}

Plugin.prototype.onError = function(err) {
  this.emitError(err)
}

Plugin.prototype.onInput = function(msg) {
  try {
    this.buffer.push(msg)
    if (this.buffer.length >= this.bufferSize) {
      this.run()
    }
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.start = function() {
  this.client.connect()
  setInterval(this.run.bind(this), this.interval * 1000)
}

Plugin.prototype.stop = function(cb) {
  if (this.ready) {
    this.run(cb)
  }
  else {
    this.log.warn('still not ready, re-scheduling last run', typeof(this.stop))
    setTimeout(lodash.partial(this.stop, cb).bind(this), 1000)
  }
}

Plugin.prototype.run = function(cb) {
  if (!this.ready) {
    this.log.warn('kafka connection not ready', {buffered: this.buffer.length})
    return
  }
  // Save a copy so can continue buffering while sending.
  var buffer = this.buffer
  if (buffer.length) {
    this.buffer = []
    this.log.info({events: buffer.length}, 'sending')
    this.producer.send([{topic: this.topic, messages: buffer}], lodash.partial(this.onResponse, cb))
    this.emitStats({events_out: buffer.length, bytes_out: sizeof(buffer)})
  }
}

Plugin.prototype.onResponse = function(cb, err, response) {
  if (err) {
    this.emitError(err)
  }
  else {
    this.emitEvent(response)
  }
  if (cb) {
    cb()
  }
}

module.exports = Plugin
