
'use strict'

const _ = require('lodash')

module.exports = (name, props, plugin, logbus) => {
  logbus.pipeline.on('READY', (event) => {
    // TODO: share a logbus object?
    // log.warn('READY?', name)
    logbus.ready = true
  })

  const inChannels = props.inChannels || []
  const outChannels = props.outChannels
  const isInput = inChannels.length === 0
  const isOutput = props.outChannels.length === 0
  const isErrors = props.module === 'errors'
  const isStats = props.module === 'stats'
  if (plugin.onInput) {
    inChannels.forEach(inChannel => logbus.pipeline.on(inChannel, plugin.onInput))
  }
  const waitingOn = {}

  let stopped = false

  const start = () => {
    if (plugin.start) {
      return plugin.start()
    }
    else {
      return new Promise((resolve) => {
        resolve({stage: logbus.stage})
      })
    }
  }

  const stop = (input) => {
    function cb() {
      logbus.pipeline.emit(name + '.stopped', name)
      stopped = true
    }
    delete waitingOn[input]
    if (Object.keys(waitingOn).length === 0) {
      logbus.log.info('stopping via', input || 'SHUTDOWN')
      if (plugin.stop) {
        plugin.stop(cb)
      }
      else {
        cb()
      }
    }
  }

  function waitOn(stage) {
    waitingOn[stage] = true
  }

  function inputs(stages) {
    const matches = []
    _.each(stages, (stage, name) => {
      if (_.intersection(stage.outChannels, inChannels).length !== 0) {
        matches.push(name)
      }
    })
    return matches
  }

  function outputs(stages) {
    const matches = []
    _.each(stages, (stage, name) => {
      if (_.intersection(stage.inChannels, props.outChannels).length !== 0) {
        matches.push(name)
      }
    })
    return matches
  }

  // TODO: This sucks - all kinds of odd coupling twix stage, plugin, and logbus instance
  return { start, stop, inputs, outputs, inChannels, outChannels, isInput, isOutput, isErrors, isStats, waitOn, waitingOn, stopped: () => stopped }
}
