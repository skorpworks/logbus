'use strict'

// Emit event as-is.  Intended as a template plugin.

module.exports = (config, logbus) => {
  // All plugin state managed in this closure.

  // Example for optional config parameters.
  const foo = config.foo || 'SOME DEFAULT' // eslint-disable-line no-unused-vars

  // Example required parameters.
  if (config.bar === undefined) {
    throw Error('`bar` not defined')
  }
  const bar = config.bar // eslint-disable-line no-unused-vars

  function onInput(event) {
    try {
      // Perform any filtering & transformation logic before emitting events to downstream stages.
      logbus.event(event)

      // Support for collecting & publishing metrics (see `stats` plugin).
      // logbus.stats({events_in: 1})
    }
    catch (err) {
      // Try to catch & handle all errors to provide as much or little context.
      logbus.error(err, event)
    }
  }

  function start() {
    // Not typically needed. Perform any startup tasks (eg connect to server,
    // load data file). Return a Promise so that logbus can know when the
    // pipeline is fully ready.
    //
    // Example inspired by elasticsearch output to make sure can connect to server.
    //
    // return new Promise((resolve, reject) => {
    //   inflight = true
    //   request('get', '/')
    //     .then((response) => {
    //       const server = JSON.parse(response.text)
    //       setInterval(ship, intervalSeconds * 1000)
    //       inflight = false
    //       resolve({server, stage: 'elasticsearch-out'})
    //     })
    // })
  }

  // Not typically needed. Perform any shutdown tasks (eg flush buffers).
  function stop() {
    // Example inspired by elasticsearch output to make sure any buffered events
    // have a chance to get shipped before shutting down the pipeline.
    //
    // return new Promise((resolve) => {
    //   if (!inflight) {
    //     ship() // flush buffered events
    //   }
    //   const wait = () => {
    //     if (inflight) {
    //       logbus.log.debug('waiting for inflight requests')
    //       setTimeout(wait, 100)
    //     }
    //     else {
    //       resolve()
    //     }
    //   }
    //   wait()
    // })
  }

  // Public api.
  return { start, onInput, stop }
}
