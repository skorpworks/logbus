'use strict'

// Emit event every `nth` sample or every `intervalSeconds` - define both
// parameters if want both kinds of sampling.

module.exports = (config, logbus) => {
  let intervalSeconds = config.intervalSeconds
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds`')
    intervalSeconds = config.interval
  }
  const nth = config.nth
  let count = 0
  let sample = null

  function start() {
    return new Promise((resolve) => {
      if (intervalSeconds != null) {
        setInterval(run, intervalSeconds * 1000)
      }
      resolve({stage: logbus.stage})
    })
  }

  function onInput(event) {
    try {
      sample = event
      if (nth != null && count % nth === 0) {
        run()
      }
      // Increment after so that first one gets sampled.
      count++
    }
    catch (err) {
      logbus.error(err)
    }
  }

  function run() {
    if (sample) {
      // Don't sample the same event multiple times.
      event = sample
      sample = null
      logbus.event(event)
    }
  }

  return { start, onInput }
}
