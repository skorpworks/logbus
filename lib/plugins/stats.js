'use strict'

// Emit aggregated stats every `intervalSeconds`. The following attributes are
// honored by stages emitting to the stats channel:
//
// - errors: number of errors
// - events_in: number of events ingested
// - events_out: number of events shipped
// - bytes_in: bytes received
// - bytes_out: bytes shipped
// - lines_in: lines processed
// - lines_out: lines emitted

/* eslint-disable camelcase */

const moment = require('moment')
const util = require('util')
const _ = require('lodash')

module.exports = (config, logbus) => {
  let begin
  let errors
  let events_in
  let events_out
  let bytes_in
  let bytes_out
  let lines_in
  let lines_out

  function reset() {
    begin = moment.utc()
    errors = 0
    events_in = 0
    events_out = 0
    bytes_in = 0
    bytes_out = 0
    lines_in = 0
    lines_out = 0
  }
  reset()

  let intervalSeconds = config.intervalSeconds || 15
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds`')
    intervalSeconds = config.interval
  }

  const enable = {
    memory: _.get(config, 'enable.memory', true),
    rates: _.get(config, 'enable.rates', false),
  }

  function start() {
    setInterval(run, intervalSeconds * 1000)
    return {stage: logbus.stage}
  }

  function onInput(data) {
    try {
      errors += _.get(data, 'errors', 0)
      events_in += _.get(data, 'events_in', 0)
      events_out += _.get(data, 'events_out', 0)
      bytes_in += _.get(data, 'bytes_in', 0)
      bytes_out += _.get(data, 'bytes_out', 0)
      lines_in += _.get(data, 'lines_in', 0)
      lines_out += _.get(data, 'lines_out', 0)
    }
    catch (err) {
      // TODO: Potential for negative feedback loop: errors -> stats -> errors
      logbus.error(err)
    }
  }

  function stop(cb) {
    run()
    cb()
    // Give downstream a chance to process.
    // setTimeout(cb, 100)
  }

  function run() {
    const stats = {
      errors,
      bytes_in,
      bytes_out,
      lines_in,
      lines_out,
      events_in,
      events_out,
      type: 'stats',
      ts: moment.utc(),
    }
    reset() // Do this shortly after capturing to try to avoid race.
    stats.message = util.format(
      'errors[%d] events[in=%d out=%d] lines[in=%d out=%d] mbytes[in=%d out=%d]',
      stats.errors, stats.events_in, stats.events_out, stats.lines_in, stats.lines_out, stats.bytes_in >> 20, stats.bytes_out >> 20)
    if (enable.memory) {
      const mem = process.memoryUsage()
      stats.heapMB = Math.round(mem.heapUsed >> 20)
      stats.rssMB = Math.round(mem.rss >> 20)
    }
    if (enable.rates) {
      const duration = (moment.utc() - begin) / 1.0 // not sure why divide-by-1.0 is needed
      stats.rate = {
        errors: Math.round(stats.errors / duration),
        events_in: Math.round(stats.events_in / duration),
        events_out: Math.round(stats.events_out / duration),
        bytes_in: Math.round(stats.bytes_in / duration),
        bytes_out: Math.round(stats.bytes_out / duration),
        lines: Math.round(stats.lines / duration)
      }
    }
    logbus.event(stats)
  }

  return { start, onInput, stop }
}
