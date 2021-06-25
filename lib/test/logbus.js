
const EventEmitter = require('events')

// Mocked logbus object

const Logbus = stage => {
  const logs = {
    trace: [],
    debug: [],
    info: [],
    warn: [],
    error: [],
  }
  const log = {
    trace: (...args) => logs.trace.push(args),
    debug: (...args) => logs.debug.push(args),
    info: (...args) => logs.info.push(args),
    warn: (...args) => logs.warn.push(args),
    error: (...args) => logs.error.push(args),
  }

  const errors = []
  function error(err) {
    errors.push(err)
  }

  const _stats = []
  function stats(props) {
    _stats.push(props)
  }

  const events = []
  function event(obj) {
    if (obj) {
      events.push(obj)
    }
    return obj
  }

  const pipeline = new EventEmitter()
  const shutdownReasons = []
  pipeline.on('SIGTERM', reason => {
    shutdownReasons.push(reason)
  })

  // pretend entire pipeline started
  const ready = true

  // helper for test cases
  function wait(ms, f) {
    return new Promise(resolve => {
      setTimeout(async () => {
        resolve(await f())
      }, ms)
    })
  }

  return {stage, pipeline, ready, wait, shutdownReasons, log, logs, error, errors, event, events, stats, _stats}
}

module.exports = {Logbus}
