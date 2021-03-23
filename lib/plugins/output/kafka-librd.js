'use strict'

// WARNING: This plugin is alpha quality.

// Send to Kafka `topic` every `intervalSeconds` using `compression`
// (none[default], gzip, snappy) serialized as `format` (none[default], json).
// When `topic` is a function, it will be called with the event as input.
//
// No events will be emitted on `outChannels`.

// TODO:
// - new topic params: num paritions
// - sending timestamp
// - partition options
// - key options

const kafka = require('node-rdkafka')
const sizeof = require('object-sizeof')
const Buffer = require('safe-buffer').Buffer

module.exports = (config, logbus) => {
  let intervalSeconds = config.intervalSeconds || 10
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds` and adjust for unit change')
    intervalSeconds = config.interval * 1000
  }

  if (!config.topic) {
    throw new Error('undefined config: topic')
  }
  let topic = () => config.topic
  if (typeof config.topic === 'function') {
    topic = config.topic.bind(config)
  }

  let serialize = i => i
  if (config.format === 'json') {
    serialize = JSON.stringify
  }

  let buffer = []

  // Configure producer.
  const options = {
    'metadata.broker.list': 'localhost:9092',
    'compression.codec': config.compression || 'none',
    'event_cb': true,
    'dr_cb': true,
    'log.connection.close': false,
    'statistics.interval.ms': 60000,
    // This is preferred but would need another spot to put `this.tx++`
    // 'delivery.report.only.error': true
  }
  if (config.hosts !== undefined) {
    options['metadata.broker.list'] = config.hosts.join(',')
  }
  if (config.debug != null) {
    // Useful for producers: 'broker,topic,msg'
    // Full list: generic, broker, topic, metadata, queue, msg, protocol, cgrp, security, fetch, feature, interceptor, plugin, all
    options.debug = config.debug
  }
  const producer = new kafka.Producer(options)
  producer.on('event.log', onLog)
  producer.on('event.error', onError)
  producer.on('event.stats', onStats)
  producer.on('delivery-report', onDeliveryReport)

  // // Keep track of unshipped events so we can try to make sure gets flushed on shutdown.
  let rx = 0
  let tx = 0

  function onLog(event) {
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
    logbus.log[method[event.severity] || 'warn']({facility: event.fac}, event.message)
  }

  // Lots of other potentially interesting stats:
  //
  //   https://github.com/edenhill/librdkafka/blob/master/STATISTICS.md
  //
  function onStats(stats) {
    logbus.stats({
      events_out: stats.txmsgs,
      bytes_out: stats.txmsg_bytes,
    })
  }

  function onDeliveryReport(err, report) {
    if (err) {
      logbus.error(err)
    }
    else {
      tx++
      // {
      //   topic: 'logbus-test',
      //   partition: 0,
      //   offset: 3,
      //   key: null,
      //   size: 50,
      // }
      logbus.log.trace(report, 'delivery report')
    }
  }

  function onError(err) {
    logbus.error(err)
  }

  function onInput(event) {
    rx += 1
    if (!producer.ready) {
      logbus.log.debug('kafka connection not ready, buffering event')
      buffer.push(event)
    }
    else {
      shipEvent(event)
    }
  }

  function shipEvent(event) {
    try {
      producer.produce(
        topic(event),
        null, // partition
        Buffer.from(serialize(event)),
        null, // key
        new Date().getTime() / 1000
      )
    }
    catch (err) {
      logbus.error(err)
    }
  }

  function start() {
    return new Promise((resolve) => {
      producer.on('ready', (options) => {
        logbus.log.info({options}, 'connected, ready to send')
        flushBuffer()
        producer.setPollInterval(intervalSeconds * 1000)
        resolve({stage: logbus.stage})
      })
      producer.connect()
    })
  }

  async function stop() {
    return new Promise((resolve) => {
      const wait = () => {
        // TODO: provide way to `await logbus.ready()`
        if (!logbus.ready) {
          logbus.log.warn('stopped yet still not ready, re-scheduling last run')
          setTimeout(wait, 1000)
        }
        else {
          // Send any events that we may have buffered then tell the kafka client to
          // flush whatever it may have buffered. Will make best effort to flush until
          // tx=rx or timed out on shutdown.
          flushBuffer()
          producer.flush(1000, () => {
            if (tx >= rx) {
              resolve()
            }
            else {
              logbus.log.warn({count: rx - tx, buffered: buffer.length}, 'unshipped events, reflushing')
              setTimeout(wait, 1000)
            }
          })
        }
      }
      wait()
    })
  }

  function flushBuffer() {
    if (buffer.length) {
      // Save a copy so can continue buffering while sending.
      const copy = buffer
      buffer = []
      logbus.log.info({count: copy.length}, 'flushing copyed messages')
      copy.forEach(shipEvent)
      logbus.stats({events_out: copy.length, bytes_out: sizeof(copy)})
    }
  }

  return { start, onInput, stop, outChannels:[] }
}
