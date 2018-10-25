'use strict'

// Emit events to stdout using `encoding` (default=utf8).

module.exports = (config, logbus) => {
  const encoding = config.encoding || 'utf8'
  process.stdout.setEncoding(encoding)
  let events_out = 0
  let bytes_out = 0

  function onInput(data) {
    try {
      process.stdout.write(data)
      events_out += 1
      bytes_out += Buffer.byteLength(data, encoding)
    }
    catch (err) {
      logbus.error(err)
    }
  }

  function onStats() {
    logbus.stats({events_out, bytes_out})
    events_out = 0
    bytes_out = 0
  }
  setInterval(onStats, 10000)

  return { onInput, outChannels:[] }
}
