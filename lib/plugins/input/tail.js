
// Tail files that match `globs` and emit lines. Globs will be re-evaluated
// every `intervalSeconds`. File metadata (start, age) stored in `db`. Start
// tailing from `start` position on new files (defaults to end of file).

// TODO: Better to emit as bytes and let downstream stages deal with char sets
// and chunking (lines vs N bytes)?  Would require our own tail-forever.

// TODO: Wean off tail-forever

const _ = require('lodash')
const fs = require('fs/promises')
const Tail = require('tail-forever')
const glob = require('glob')

module.exports = (config, logbus) => {
  if (!config.globs) {
    throw new Error('undefined config: globs')
  }
  const globs = config.globs
  const globopts = {
    strict: true,
    silent: false,
    noglobstar: true,
    realpath: true,
  }
  let tails = {}

  let intervalSeconds = config.intervalSeconds || 60
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds`')
    intervalSeconds = config.interval
  }

  const db = config.db || (logbus.stage + '.taildb') // eslint-disable-line no-extra-parens
  const startPosition = config.start != null ? config.start : null
  let meta = {}

  async function stopWatching() {
    // Stop tailing files (ie close) and save current metadata.
    _.each(tails, async (foo, path) => {
      const pathmeta = await tails[path].unwatch()
      // logbus.log.debug(`stopping: ${path}@${pathmeta.pos}`)
      if (!meta[path]) {
        meta[path] = {}
      }
      meta[path].start = pathmeta.pos
      meta[path].inode = pathmeta.inode
    })
    await fs.writeFile(db, JSON.stringify(meta, null, 2))
  }

  let linesIn = 0
  let bytesIn = 0

  function onStats() { /* eslint-disable camelcase */
    logbus.stats({
      lines_in: linesIn,
      bytes_in: bytesIn,
    })
    linesIn = 0
    bytesIn = 0
  }

  function onLine(line) {
    try {
      logbus.event(line)
      linesIn += 1
      bytesIn += line.length
    } catch (err) {
      logbus.error(err)
    }
  }

  function onGlob(err, paths) {
    if (err) {
      logbus.error(err)
    }
    paths.forEach(async path => {
      const stat = await fs.stat(path)
      const opts = {start: startPosition, inode: stat.ino} // , bufferSize: -1}
      if (meta[path]) {
        if (stat.size < meta[path].start) {
          // In case of file truncation, start back at 0.
          opts.start = 0
        } else if (stat.ino !== meta[path].inode) {
          // In case of file rotation, start back at 0.
          opts.start = 0
        } else {
          opts.start = meta[path].start
        }
      }
      // logbus.log.debug(`tailing: ${path}@${opts.start}`)
      tails[path] = new Tail(path, opts)
      tails[path].on('line', onLine)
    })
  }

  async function refresh() {
    await stopWatching()
    // Reset open file map using glob matches.
    tails = {}
    globs.forEach(pattern => {
      glob(pattern, globopts, onGlob)
    })
  }

  const timer = {
    refresh: null,
    stats: null,
  }

  async function start() {
    try {
      meta = JSON.parse(await fs.readFile(db))
    } catch (err) {
      logbus.log.error(err, `failed to read tail db: ${db}`)
    }
    await refresh()
    return new Promise(resolve => {
      timer.refresh = setInterval(refresh, intervalSeconds * 1000)
      timer.stats = setInterval(onStats, 10000)
      resolve({stage: logbus.stage})
    })
  }

  async function stop() {
    if (timer.refresh) {
      clearInterval(timer.refresh)
    }
    if (timer.stats) {
      clearInterval(timer.stats)
    }
    await stopWatching()
  }

  return {start, stop}
}
