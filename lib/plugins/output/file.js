'use strict'

// Write events to `path` using `encoding`.  Append when `config.append` is true, overwirte otherwise.

const fs = require('fs')
const moment = require('moment')

function resolvePath(filepath) {
  const path = require('path')
  if (filepath[0] === '~') {
    return path.join(process.env.HOME, filepath.slice(1))
  }
  return filepath
}

module.exports = (config, logbus) => {
  if (config.path === undefined) {
    throw new Error('undefined config: path')
  }
  const file = fs.createWriteStream(resolvePath(config.path), {
    flags: config.append ? 'a' : 'w',
    encoding: config.encoding || 'utf8',
  })

  function onInput(data) {
    try {
      file.write(data)
      // logbus.stats({events_out: 1, bytes_out: written})
    }
    catch (err) {
      logbus.error(err)
    }
  }

  function stop(cb) {
    file.end(null, null, cb)
  }

  return { onInput, stop, outChannels:[] }
}
