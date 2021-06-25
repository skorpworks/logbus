
// Emit event for every row returned by `query` operating on events buffered
// until `intervalSeconds` or `bufferSize` reached, whichever comes first.

const alasql = require('alasql')

module.exports = (config, logbus) => {
  let buffer = []
  const bufferSize = config.bufferSize || 10000
  let intervalSeconds = config.intervalSeconds || 60
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds`')
    intervalSeconds = config.interval
  }
  const query = alasql.compile(config.query)

  function run() {
    // Save a copy so can continue buffering while indexing.
    const copy = buffer
    buffer = []
    if (copy.length) {
      try {
        query([copy]).forEach(logbus.event)
      } catch (err) {
        logbus.error(err)
      }
    }
  }

  function start() {
    return new Promise(resolve => {
      setInterval(run, intervalSeconds * 1000)
      resolve({stage: logbus.stage})
    })
  }

  function onInput(data) {
    try {
      buffer.push(data)
      if (buffer.length > bufferSize) {
        run()
      }
    } catch (err) {
      logbus.error(err)
    }
  }

  function stop() {
    run()
  }

  return {start, onInput, stop}
}
