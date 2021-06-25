
// Emit error events every `intervalSeconds`. Errors are aggregated by
// stage+msg only a sample of each is emitted in order to reduce log spam -
// seeing the same error msg many times per second is not helpful.
//
// To minimize memory consumption, only `stackDepth` levels of an exceptions are kept.

const moment = require('moment')
const util = require('util')
const _ = require('lodash')

module.exports = (config, logbus) => {
  let errors = {}
  let intervalSeconds = config.intervalSeconds || 60
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds`')
    intervalSeconds = config.interval
  }
  const stackDepth = config.stackDepth || 1

  function run() {
    let total = 0
    // Save a copy so can continue buffering while indexing.
    const copy = errors
    errors = {}
    _.each(copy, (tracebacks, message) => {
      // Just sample the first error for now and hope it's representative enough.
      const stack = tracebacks[0]
      const count = tracebacks.length
      total += count
      logbus.event({
        message,
        stack,
        count,
        type: 'error',
        ts: moment.utc(),
        severity: 3,
      })
    })
    logbus.stats({errors: total})
  }

  let timer = null

  function start() {
    timer = setInterval(run, intervalSeconds * 1000)
    return {stage: logbus.stage}
  }

  function onInput(err) {
    const stack = (err.stack.toString() || '').split('\n')
    const msg = util.format('%s: %s', err.stage, stack.shift())
    if (typeof errors[msg] === 'undefined') {
      errors[msg] = []
    }
    errors[msg].push(stack.slice(0, stackDepth))
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
    }
    run()
  }

  return {start, onInput, stop}
}
