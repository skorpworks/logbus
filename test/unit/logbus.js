
const EventEmitter = require('eventemitter3')

// Mocked logbus object

const Logbus = (stage) => {
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
    events.push(obj)
  }

  const pipeline = new EventEmitter()
  const shutdownReasons = []
  pipeline.on('SIGTERM', (reason) => {
    // console.log('YOU GO IT!', reason, this, shutdownReasons)
    shutdownReasons.push(reason)
  })

  // pretend entire pipeline started
  ready = true

  return { stage, pipeline, ready, shutdownReasons, log, logs, error, errors, event, events, stats, _stats }
}

module.exports = { Logbus }
