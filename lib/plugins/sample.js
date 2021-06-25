
// Emit event every `nth` sample or every `intervalSeconds` - define both
// parameters if want both kinds of sampling.

module.exports = (config, logbus) => {
  let intervalSeconds = config.intervalSeconds
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds`')
    intervalSeconds = config.interval
  }
  const nth = config.nth
  if (nth == null && intervalSeconds == null) {
    throw Error('undefined config: nth or intervalSeconds')
  }
  if (intervalSeconds != null && intervalSeconds <= 0) {
    throw Error('invalid config: intervalSeconds must be > 0')
  }
  if (nth != null && nth <= 0) {
    throw Error('invalid config: nth must be > 0')
  }
  let count = 0
  let sample = null

  function run() {
    if (sample) {
      // Don't sample the same event multiple times.
      logbus.event(sample)
      sample = null
    }
  }

  let timer = null

  function start() {
    if (intervalSeconds != null) {
      timer = setInterval(run, intervalSeconds * 1000)
    }
    return {stage: logbus.stage}
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
    }
  }

  function onInput(event) {
    try {
      sample = event
      if (nth != null && count % nth === 0) {
        run()
      }
      // Increment after so that first one gets sampled.
      count++
    } catch (err) {
      logbus.error(err)
    }
  }

  return {start, stop, onInput}
}
