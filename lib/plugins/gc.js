
// Force a garbage collection every `intervalSeconds`. A msg indicating that the
// collection is finished is emitted.

const moment = require('moment')

module.exports = (config, logbus) => {
  const intervalSeconds = config.intervalSeconds || 60

  function run() {
    const begin = moment.utc()
    global.gc()
    logbus.event({
      msg: 'garbage collected',
      duration: moment.utc() - begin,
    })
  }

  function start() {
    if (global.gc) {
      setInterval(run, intervalSeconds * 1000)
    } else {
      logbus.log.warn('explicit garbage collection unavailable')
    }
    return {stage: logbus.stage}
  }

  return {start}
}
