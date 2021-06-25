
const util = require('util')
const moment = require('moment')

// Emit an aggregated event: `view([event])`. NOTE: this module only provides
// some primitives to help with your aggregation needs. In other words, these
// details are left for the pipeline to define:
//
// - Which events to aggregate?  See `filtered()`.
// - How to group them?  See `key()`.
// - When to emit an aggregated event? `maxSize`, `maxEventSeconds`, and
//   `maxRealSeconds` can be defined in the pipeline as scalars or functions.

// `filtered(event)` should return true to ignore events that SHOULD NOT be
// aggregated at all or that should go through a different agg stage. In this
// example, all events not marked for "count" aggregation in upstream stages
// will be ignored by this agg stage.
//
//     filtered: !!js/function >-
//       function(event) {
//         return !event._agg || !event._agg.type.startsWith('count')
//       }

// `key(event)` should return the value used to group events. In this example,
// earlier stages would declare how the event should be aggregated by defining
// an `_agg` object (completely pipeline-defined).
//
//     key: !!js/function >-
//       function(event) {
//         return event._agg.key
//       }

// `view([event])` should return the single, aggregated event for the given list
// of events. Here is one example:
//
//     view: !!js/function >-
//       function(events) {
//         const event = events[0]
//         event.end = events[events.length-1].ts
//         event.duration = Math.round((event.end - event.ts) / 1000)
//         event.count = events.length
//         if (event.exception) {
//           // noisy exceptions
//           event.message = this.util.format('%dx: %s', event.count, event.message)
//         }
//         else if (event.process === 'noisy-process') {
//           // noisy processes
//           event.message = events.map(i => i.message).join("\n")
//         }
//         else {
//           // noisy messages
//           event.message = this.util.format('%dx: %s', event.count, event._agg.key)
//         }
//         delete event._agg
//         return event
//       }

// Events can also be grouped by pipeline-defined `start` & `stop` functions. An
// example of when this might be useful is when there are known start & stop
// markers such as the output from a process:
//
//     Starting job foo...
//     Did bar.
//     Did baz.
//     Finished foo.
//
//     start: !!js/function >-
//       function(event) {
//         return event.message.test(/^start/i)
//       }
//
//     stop: !!js/function >-
//       function(event) {
//         return event.message.test(/^finish/i)
//       }

const os = require('os')

module.exports = (config, logbus) => {
  const buckets = {}
  const tsField = config.tsField || 'ts'
  if (typeof config.filtered !== 'function') {
    throw new Error('`filtered` function not defined')
  }
  if (typeof config.key !== 'function') {
    throw new Error('`key` function not defined')
  }
  if (typeof config.view !== 'function') {
    throw new Error('`view` function not defined')
  }
  const sandbox = {
    config,
    util,
    moment,
    math: Math,
    hostname: os.hostname(),
  }
  const filtered = config.filtered.bind(sandbox)
  const getKey = config.key.bind(sandbox)
  const bucketToEvent = config.view.bind(sandbox)
  // These start & stop functions not generally useful, so default accordingly.
  let startBucket = () => true
  if (typeof config.start === 'function') {
    startBucket = config.start.bind(sandbox)
  }
  let stopBucket = () => false
  if (typeof config.stop === 'function') {
    stopBucket = config.stop.bind(sandbox)
  }
  let maxSize = null
  if (typeof config.maxSize === 'function') {
    maxSize = config.maxSize.bind(sandbox)
  } else {
    maxSize = event => {
      return event._agg?.maxSize || config.maxSize || 1000
    }
  }
  let maxEventSeconds = null
  if (typeof config.maxEventSeconds === 'function') {
    maxEventSeconds = config.maxEventSeconds.bind(sandbox)
  } else {
    maxEventSeconds = event => {
      return event._agg?.maxEventSeconds || config.maxEventSeconds || 300
    }
  }
  let maxRealSeconds = null
  if (typeof config.maxRealSeconds === 'function') {
    maxRealSeconds = config.maxRealSeconds.bind(sandbox)
  } else {
    maxRealSeconds = () => {
      return config.maxRealSeconds || 300
    }
  }

  const process = bucket => {
    try {
      if (!bucket.length) {
        return
      }
      const event = bucketToEvent(bucket)
      if (event) {
        logbus.event(event)
      }
    } catch (err) {
      logbus.error(err)
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
          delete buckets[key]
          process(bucket)
        } else if (bucket.length >= maxSize(data)) {
          delete buckets[key]
          process(bucket)
        } else if (data[tsField] - bucket[0][tsField] >= maxEventSeconds(data) * 1000) {
          // Since we timed out waiting for bucket to complete, leave this event
          // for next group since probably doesn't belone to current bucket.
          // Useful when want to group all output for a process that doesn't
          // have good start & stop markers.
          buckets[key] = [bucket.pop()]
          process(bucket)
        }
      } else if (startBucket(data)) {
        buckets[key] = [data]
      }
    } catch (err) {
      logbus.error(err)
    }
  }

  function flush() {
    Object.keys(buckets).forEach(key => {
      process(buckets[key])
      delete buckets[key]
    })
  }

  function start() {
    setInterval(flush, maxRealSeconds() * 1000)
    return {stage: logbus.stage}
  }

  function stop() {
    flush()
  }

  return {start, onInput, stop}
}
