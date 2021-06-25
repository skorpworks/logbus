
// Read stdin as `encoding`. String is split by `matcher`. Throttle reading at
// `maxMbps`. Will shut down the pipeline unless `stopOnEOF` is false.

const defaults = {
  encoding: 'utf8',
  matcher: /\r?\n/u,
  maxMbps: 100,
  stopOnEOF: true,
}

// TODO: Easy to support streams that aren't plain text (eg compressed, custom format)?

const split = require('split2')
const Throttle = require('stream-throttle').Throttle

module.exports = (config, logbus) => {
  const encoding = config.encoding || defaults.encoding
  const matcher = config.matcher || defaults.matcher
  const maxMbps = config.maxMbps || defaults.maxMbps
  const stopOnEOF = config.stopOnEOF != null ? config.stopOnEOF : defaults.stopOnEOF

  let bytesIn = 0
  let eventsIn = 0

  function onData(data) {
    try {
      logbus.event(data)
      eventsIn += 1
      bytesIn += Buffer.byteLength(data, encoding)
    } catch (err) {
      logbus.error(err)
    }
  }

  function start() {
    return new Promise(resolve => {
      const stream = process.stdin.pipe(new Throttle({rate: maxMbps << 20})).pipe(split(matcher)) // eslint-disable-line no-bitwise
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

  function onStats() {
    logbus.stats({/* eslint-disable camelcase */
      events_in: eventsIn,
      bytes_in: bytesIn,
    })
    bytesIn = 0
    eventsIn = 0
  }
  setInterval(onStats, 10000)

  return {defaults, start}
}
