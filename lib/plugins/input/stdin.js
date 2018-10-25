'use strict'

const doc = `
Read stdin as \`encoding\`. String is split by \`matcher\`. Throttle reading at
\`maxMbps\`. Will shut down the pipeline unless \`stopOnEOF\` is false.
`
const defaults = {
  encoding: 'utf8',
  matcher: /\r?\n/,
  maxMbps: 100,
  stopOnEOF: true,
}

// TODO: Easy to support streams that aren't plain text (eg compressed, custom format)?

var split = require('split2')
var Throttle = require('stream-throttle').Throttle

module.exports = (config, logbus) => {
  const encoding = config.encoding || defaults.encoding
  const matcher = config.matcher || defaults.matcher
  const maxMbps = config.maxMbps || defaults.maxMbps
  const stopOnEOF = config.stopOnEOF !== undefined ? config.stopOnEOF : defaults.stopOnEOF

  function start() {
    return new Promise((resolve) => {
      const stream = process.stdin.pipe(new Throttle({rate: maxMbps << 20})).pipe(split(matcher))
      if (stopOnEOF) {
        stream.on('end', function() {
          logbus.pipeline.emit('SIGTERM', 'stdin closed')
        })
      }
      stream.setEncoding(encoding)
      stream.on('data', onData)
      stream.on('error', logbus.error)
      resolve({stage: logbus.stage})
    })
  }

  let bytes_in = 0
  let events_in = 0

  function onData(data) {
    try {
      logbus.event(data)
      events_in += 1
      bytes_in += Buffer.byteLength(data, encoding)
    }
    catch (err) {
      logbus.error(err)
    }
  }

  function onStats() {
    logbus.stats({events_in, bytes_in})
    bytes_in = 0
    events_in = 0
  }
  setInterval(onStats, 10000)

  return { doc, defaults, start }
}
