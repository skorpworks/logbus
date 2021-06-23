'use strict'

// Tail systemd journal and emit structured event. Instead of actually tailing
// the journal, the journal will be queried every `intervalSeconds`. File
// metadata (eg last timestamp) stored in `db`. Start tailing from
// `sinceMinutes` when no last timestamp in `db`.

// TODO: Re-visit node journald bindings instead of exec'ing.

const fs = require('fs')
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
  const meta = fs.existsSync(db) ? JSON.parse(fs.readFileSync(db)) : {}
  if (meta.ts !== undefined) {
    meta.ts = moment(meta.ts)
  }
  else {
    meta.ts = moment()
    let sinceMinutes = config.sinceMinutes
    if (config.since) {
      logbus.log.warn('`since` config option deprecated - use `sinceMinutes`')
      sinceMinutes = config.since
    }
    if (sinceMinutes !== undefined) {
      meta.ts.subtract(sinceMinutes, 'minutes')
    }
  }
  let processing = false

  async function start() {
    return new Promise((resolve) => {
      refresh()
      setInterval(refresh, intervalSeconds * 1000)
      resolve({stage: logbus.stage})
    })
  }

  async function stop() {
    return new Promise((resolve) => {
      const wait = () => {
        if (!processing) {
          resolve()
        }
        else {
          logbus.log.warn('waiting to finish processing current batch')
          setTimeout(wait, 100)
        }
      }
      wait()
    })
  }

  function refresh() {
    // TODO: protect against parallel refresh, like during unit tests with tight interval
    const args = ['-o', 'json', '-n', '1000']
    if (meta.cursor) {
      args.push('--after-cursor')
      args.push(meta.cursor)
    }
    else {
      args.push('--since')
      args.push(meta.ts.format('YYYY-MM-DD HH:mm:ss'))
    }
    // logbus.log.info('EXEC:', new Date(), args.join(', '))
    execFile(journalctl, args, {maxBuffer: 10 << 20}, onJournal)
  }

  function onJournal(err, stdout, stderr) {
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
      let event
      stdout.split('\n').filter(i => i).forEach((line) => {
        // logbus.log.info('LINE:', line)
        try {
          event = JSON.parse(line)
          logbus.event(event)
          eventsIn += 1
        }
        catch (err) {
          logbus.error(err, line)
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
      fs.writeFileSync(db, JSON.stringify(meta, null, 2))
      logbus.stats({
        events_in: eventsIn,
        bytes_in: bytesIn,
      })
    }
    catch (err) {
      logbus.log.error(err)
    }
    finally {
      processing = false
    }
  }

  return { start, stop }
}
