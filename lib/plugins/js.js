'use strict'

// Apply `function(event)` to upstream events. Null results are filtered,
// otherwise emitted downstream.  Define `lastCall()` to emit event before
// pipeline shut down.

// IDEA: errorView(event) to pass to error handler, something to aide
// debugging without logging all the event data.

const _ = require('lodash')

module.exports = (config, logbus) => {
  if (config.function === undefined) {
    throw new Error('undefined config: function')
  }
  const sandbox = {
    hostname: require('os').hostname(),
    config: config,
    util: require('util'),
    moment: require('moment'),
  }
  const call = config.function.bind(sandbox)
  const lastCall = _.get(config, 'lastCall', () => {}).bind(sandbox)

  function onInput(data, channel) {
    try {
      const event = call(data, channel)
      if (event) {
        logbus.event(event)
      }
    }
    catch (err) {
      logbus.error(err)
    }
  }

  async function stop() {
    const event = await lastCall()
    if (event) {
      logbus.event(event)
    }
  }

  return { onInput, stop }
}
