
// Tail systemd journal and emit structured event. Instead of actually tailing
// the journal, the journal will be queried every `intervalSeconds`. File
// metadata (eg last timestamp) stored in `db`. Start tailing from
// `sinceMinutes` when no last timestamp in `db`.

const fs = require('fs/promises')
const moment = require('moment')
const execFile = require('child_process').execFile

module.exports = (config, logbus) => {
  const journalctl = config.journalctl || 'journalctl'
  let intervalSeconds = config.intervalSeconds || 60
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds`')
    intervalSeconds = config.interval
  }
  const db = config.db || 'logbus-journal-db'
  let meta = {
    ts: moment(),
  }
  let sinceMinutes = config.sinceMinutes
  if (config.since) {
    logbus.log.warn('`since` config option deprecated - use `sinceMinutes`')
    sinceMinutes = config.since
  }
  if (sinceMinutes) {
    meta.ts.subtract(sinceMinutes, 'minutes')
  }
  let processing = false

  async function onJournal(err, stdout, stderr) {
    if (err) {
      logbus.log.error(err, 'could not exec journalctl')
      return
    }
    if (stderr.length) {
      logbus.log.warn({stderr}, 'non-zero stderr from journalctl')
    }
    try {
      processing = true
      let eventsIn = 0
      const bytesIn = stdout.length
      let event = null
      stdout.split('\n').filter(i => i).forEach(line => {
        try {
          event = JSON.parse(line)
          logbus.event(event)
          eventsIn += 1
        } catch (exc) {
          logbus.error(exc, line)
        }
      })
      if (event) {
        if (event.__CURSOR) {
          meta.cursor = event.__CURSOR
        }
        if (event.__REALTIME_TIMESTAMP) {
          meta.ts = moment.unix(event.__REALTIME_TIMESTAMP / 1000000)
        }
      }
      await fs.writeFile(db, JSON.stringify(meta, null, 2))
      logbus.stats({/* eslint-disable camelcase */
        events_in: eventsIn,
        bytes_in: bytesIn,
      })
    } catch (exc) {
      logbus.log.error(exc)
    } finally {
      processing = false
    }
  }

  function refresh() {
    if (processing) {
      // protect against parallel refresh, like during unit tests with tight interval
      return
    }
    const args = ['-o', 'json', '-n', '1000']
    if (meta.cursor) {
      args.push('--after-cursor')
      args.push(meta.cursor)
    } else {
      args.push('--since')
      args.push(meta.ts.format('YYYY-MM-DD HH:mm:ss'))
    }
    // logbus.log.info('EXEC:', new Date(), args.join(', '))
    execFile(journalctl, args, {maxBuffer: 10 << 20}, onJournal) // eslint-disable-line no-bitwise
  }

  let timer = null

  async function start() {
    try {
      meta = JSON.parse(await fs.readFile(db))
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logbus.log.error(err, `failed to read journal state db: ${db}`)
      }
    }
    refresh()
    timer = setInterval(refresh, intervalSeconds * 1000)
    return {stage: logbus.stage}
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
    }
    return new Promise(resolve => {
      const wait = () => {
        if (!processing) {
          resolve()
        } else {
          logbus.log.warn('waiting to finish processing current batch')
          setTimeout(wait, 100)
        }
      }
      wait()
    })
  }

  return {start, stop}
}
