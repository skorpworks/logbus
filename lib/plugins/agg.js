'use strict'

// Emit an aggregated event for all events between `start()` and `stop()`.

const os = require('os')

module.exports = (config, logbus) => {
  const buckets = {}
  const tsField = config.tsField || 'ts'
  if (typeof config.filtered !== 'function') {
    throw new Error('`filtered` function not defined')
  }
  if (typeof config.start !== 'function') {
    throw new Error('`start` function not defined')
  }
  if (typeof config.stop !== 'function') {
    throw new Error('`stop` function not defined')
  }
  if (typeof config.key !== 'function') {
    throw new Error('`key` function not defined')
  }
  if (typeof config.view !== 'function') {
    throw new Error('`view` function not defined')
  }
  const sandbox = {
    math: Math,
    hostname: os.hostname(),
    config: config,
    util: require('util'),
    moment: require('moment'),
  }
  const filtered = config.filtered.bind(sandbox)
  const startBucket = config.start.bind(sandbox)
  const stopBucket = config.stop.bind(sandbox)
  const getKey = config.key.bind(sandbox)
  const bucketToEvent = config.view.bind(sandbox)
  let maxSize
  if (typeof config.maxSize === 'function') {
    maxSize = config.maxSize.bind(sandbox)
  }
  else {
    maxSize = (event) => {
      return (event._agg && event._agg.maxSize) || config.maxSize || 1000
    }
  }
  let maxEventSeconds
  if (typeof config.maxEventSeconds === 'function') {
    maxEventSeconds = config.maxEventSeconds.bind(sandbox)
  }
  else {
    maxEventSeconds = (event) => {
      return (event._agg && event._agg.maxEventSeconds) || config.maxEventSeconds || 300
    }
  }
  let maxRealSeconds
  if (typeof config.maxRealSeconds === 'function') {
    maxRealSeconds = config.maxRealSeconds.bind(sandbox)
  }
  else {
    maxRealSeconds = () => {
      return config.maxRealSeconds || 300
    }
  }

  function onInput(data) {
    try {
      if (filtered(data)) {
        return
      }
      const key = getKey(data)
      const bucket = buckets[key]
      if (bucket) {
        bucket.push(data)
        if (stopBucket(data)) {
          run([key])
        }
        else if (bucket.length >= maxSize(data)) {
          run([key])
        }
        else if ((data[tsField] - bucket[0][tsField]) >= maxEventSeconds(data) * 1000) {
          run([key], {timedOut: true})
        }
      }
      else {
        if (startBucket(data)) {
          buckets[key] = [data]
        }
      }
    }
    catch (err) {
      logbus.error(err)
    }
  }

  function start() {
    setTimeout(run, maxRealSeconds() * 1000)
    return {stage: logbus.stage}
  }

  function stop(cb) {
    run()
    cb()
  }

  function run(keys, opts) {
    opts = Object.assign({timedOut: false}, opts)
    if (keys === undefined) {
      keys = Object.keys(buckets)
    }
    keys.forEach((key) => {
      try {
        let next
        if (opts.timedOut) {
          // The last one probably doesn't belong, especially when aggregating cron jobs.
          next = buckets[key].pop()
        }
        const event = bucketToEvent(buckets[key])
        if (event) {
          logbus.event(event)
        }
        delete buckets[key]
        if (next) {
          buckets[key] = [next]
        }
      }
      catch (err) {
        logbus.error(err)
      }
    })
  }

  return { start, onInput, stop }
}
