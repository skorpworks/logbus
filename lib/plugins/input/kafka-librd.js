
// WARNING: This plugin is alpha quality.

// Read from Kafka `topics` as consumer `groupId` (default=logbus) using
// `compression` (none[default], gzip, snappy). Start at `offset`
// (default=latest) when no offset defined for this consumer group.
//
//  Shut down the pipeline when at end of topics and no new data for
// `exitAfterSeconds`. Messages can be unserialized here via `format`
// (none[default], json).

// TODO:
// - configuration to control where to start from.
// - figure out when to commit offset. Immediately and assume will make it
//   downstream? Wait for some signal downsstream that events made it?

const kafka = require('node-rdkafka')

module.exports = (config, logbus) => {
  if (!config.topics) {
    throw new Error('undefined config: topics')
  }
  const topics = config.topics

  let parse = i => i
  if (config.format === 'json') {
    parse = JSON.parse
  }

  // Configure consumer.
  const options = {
    'metadata.broker.list': 'localhost:9092',
    'group.id': config.groupId || 'logbus',
    'compression.codec': config.compression || 'none',
    'event_cb': true,
    // 'rebalance_cb': true, // HERE BE DRAGONS!
    'enable.auto.commit': true,
    'statistics.interval.ms': 60000,
  }
  if (config.hosts) {
    options['metadata.broker.list'] = config.hosts.join(',')
  }
  if (config.debug != null) {
    // Useful for consumers: 'cgrp,topic,fetch'
    // Full list: generic, broker, topic, metadata, queue, msg, protocol, cgrp, security, fetch, feature, interceptor, plugin, all
    options.debug = config.debug
  }
  const topicOptions = {
    'auto.offset.reset': config.offset || 'latest',
  }
  const consumer = new kafka.KafkaConsumer(options, topicOptions)

  // Setup end-of-topics behavior.
  const exitAfterSeconds = config.exitAfterSeconds
  let endCheck = null
  let tsLastMsg = null
  function checkTopicEnd() {
    const now = new Date().getTime() / 1000
    if (now - tsLastMsg > exitAfterSeconds) {
      logbus.pipeline.emit('SIGTERM', 'at end of kafka topics')
      clearInterval(endCheck)
    }
  }
  function resetExitTimer() {
    tsLastMsg = new Date().getTime() / 1000
  }
  resetExitTimer()

  function start() {
    return new Promise(resolve => {
      consumer.connect()
      consumer.on('ready', opts => {
        logbus.log.info(opts, 'ready to consume')
        consumer.subscribe(topics)
        consumer.consume()
        // Would like to control consumption rate & batch size but this tells a poor shutdown story.
        // var that = this
        // this.consuming = setInterval(event => {
        //   that.consumer.consume(100, that.onConsumption.bind(that))
        // }, this.interval)

        if (exitAfterSeconds != null) {
          endCheck = setInterval(checkTopicEnd, 500)
        }
        resolve({stage: logbus.stage})
      })
    })
  }

  function stop(cb) {
    consumer.unsubscribe()
    consumer.disconnect(cb)
  }

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
  consumer.on('event.log', onLog)

  function onError(err) {
    if (consumer.ready) {
      logbus.error(err)
    }
  }
  consumer.on('event.error', onError)

  // function onRebalance(event) {
  //   // Just log for now so we can know when it happens. May need to do something
  //   // else if default rebalance algorithm too derpy.
  //   logbus.log.warn(event)
  // }

  // Lots of other potentially interesting stats:
  //
  //   https://github.com/edenhill/librdkafka/blob/master/STATISTICS.md
  //
  function onStats(stats) {
    logbus.stats({/* eslint-disable camelcase */
      events_in: stats.rxmsgs,
      bytes_in: stats.rxmsg_bytes,
    })
  }
  consumer.on('event.stats', onStats)

  // function onConsumption(err, events) {
  //   if (err) {
  //     logbus.error(err)
  //   }
  //   else {
  //     events.forEach(event => {
  //       try {
  //         logbus.log.debug({size: event.value.length, partition: event.partition, offset: event.offset}, 'event')
  //         logbus.event(parse(event.value))
  //         resetExitTimer()
  //         // logbus.stats({events_in: 1, bytes_in: event.value.length})
  //       }
  //       catch (err) {
  //         logbus.error(err)
  //       }
  //     })
  //   }
  // }

  function onData(event) {
    try {
      logbus.log.debug({size: event.value.length, partition: event.partition, offset: event.offset}, 'event')
      logbus.event(parse(event.value))
      resetExitTimer()
      // logbus.stats({events_in: 1, bytes_in: event.value.length})
    } catch (err) {
      logbus.error(err)
    }
  }
  consumer.on('data', onData)
  // this.consumer.on('rebalance', this.onRebalance.bind(this))

  return {start, stop}
}
