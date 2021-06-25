
// Emit events to stdout using `encoding` (default=utf8).

module.exports = (config, logbus) => {
  const encoding = config.encoding || 'utf8'
  process.stdout.setEncoding(encoding)
  let eventsOut = 0
  let bytesOut = 0

  function onInput(data) {
    try {
      process.stdout.write(data)
      eventsOut += 1
      bytesOut += Buffer.byteLength(data, encoding)
    } catch (err) {
      logbus.error(err)
    }
  }

  function onStats() {
    logbus.stats({/* eslint-disable camelcase */
      events_out: eventsOut,
      bytes_out: bytesOut,
    })
    eventsOut = 0
    bytesOut = 0
  }

  let timer = null

  function start() {
    timer = setInterval(onStats, 10000)
  }

  function stop() {
    if (timer) {
      console.log('STOPPING STDOUT STATS')
      clearInterval(timer)
    }
  }

  return {start, stop, onInput, outChannels: []}
}
