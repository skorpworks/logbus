'use strict'

// Read files that match `globs` on startup and emit strings assuming
// `encoding`. Throttle reading at `maxMbps`. Will exit once all globbed files
// fully consumed - see the `tail` plugin for watching files indefinitely.

const Throttle = require('stream-throttle').Throttle
const fs = require('fs')
const glob = require('glob')
const _ = require('lodash')

module.exports = (config, logbus) => {
  if (config.globs === undefined) {
    throw new Error('undefined config: globs')
  }
  const globs = config.globs
  const globopts = {
    strict: true,
    silent: false,
    noglobstar: true,
    realpath: true,
  }
  const paths = {}
  const maxbps = (config.maxMbps || 100) << 20
  const encoding = config.encoding || 'utf8'

  function start() {
    return new Promise((resolve) => {
      globs.forEach((pattern) => {
        glob.sync(pattern, globopts).forEach((path) => {
          paths[path] = true
          // Lesson learned: don't share Throttle instances across streams.  Don't cross the streams!
          const stream = fs.createReadStream(path).pipe(new Throttle({rate: maxbps}))
          stream.on('end', () => onEOF(path))
          stream.on('data', onData)
          stream.on('error', (err) => logbus.error(err, {path: path}))
        })
      })
      resolve({stage: logbus.stage})
    })
  }

  function onEOF(path) {
    logbus.log.info('finished', path)
    delete paths[path]
    if (_.isEmpty(paths)) {
      logbus.pipeline.emit('SIGTERM', 'end of all files')
    }
  }

  function onData(data) {
    logbus.event(data.toString(encoding))
    logbus.stats({bytes_in: Buffer.byteLength(data)})
  }

  return { start }
}
