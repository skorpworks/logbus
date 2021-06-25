
// Log events at `defaultLevel`. Attach arbitrary `extra` metadata to each log.
// Does not emit anything.

const HOSTNAME = require('os').hostname()
const METHODS = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
  1: 'fatal',
  2: 'fatal',
  3: 'error',
  4: 'warn',
  5: 'info',
  6: 'debug',
  7: 'trace',
  warning: 'warn',
  err: 'error',
}

module.exports = (config, logbus) => {
  const extra = config.extra || {}
  const defaultLevel = config.defaultLevel || 'info'

  function onInput(data) {
    const log = {...extra, ...data}
    if (!log.hostname) {
      // Without this, then bunyan thinks it invalid.
      log.hostname = HOSTNAME
    }
    const message = data.msg || data.message
    let level = log.level || log.severity || defaultLevel
    if (typeof level === 'string') {
      level = level.toLowerCase()
    }
    let method = METHODS[level] || level || 'info'
    if (!logbus.log[method]) {
      method = 'error'
    }
    delete log.message
    delete log.msg
    delete log.level
    logbus.log[method](log, message)
  }

  return {onInput, outChannels: []}
}
