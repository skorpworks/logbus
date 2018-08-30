'use strict'

// Emit text as individual lines.  Lines greater than `maxSize` will be truncated.

const Buffer = require('safe-buffer').Buffer

module.exports = (config, logbus) => {
  const encoding = config.encoding || 'utf8'
  const maxSize = config.maxSize || 64 << 10
  let buffer = ''

  function onInput(txt) {
    try {
      const lines = (buffer + txt).split('\n')
      buffer = lines.pop()
      lines.forEach((line) => {
        if (Buffer.byteLength(line, encoding) > maxSize) {
          const truncated = Buffer.alloc(maxSize)
          truncated.write(line)
          line = truncated.toString()
        }
        if (line) {
          logbus.event(line)
        }
      })
      logbus.stats({lines_in: lines.length})
    }
    catch (err) {
      logbus.error(err)
    }
  }

  return { onInput }
}
