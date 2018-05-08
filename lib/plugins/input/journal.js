'use strict'

// Tail systemd journal and emit structured event. Instead of actually tailing the journal, the journal will be queried
// every `interval` seconds. File metadata (eg last timestamp) stored in `db`.

const fs = require('fs')
const moment = require('moment')
const execFile = require('child_process').execFile

function Plugin(config) {
  this.interval = config.interval || 60
  this.db = config.db || 'logbus-journal-db'
  if (fs.existsSync(this.db)) {
    this.meta = JSON.parse(fs.readFileSync(this.db))
  } else {
    this.meta = {}
  }
  if (this.meta.ts !== undefined) {
    this.meta.ts = moment(this.meta.ts)
  }
  else {
    this.meta.ts = moment()
    if (config.since !== undefined) {
      this.meta.ts.subtract(config.since, 'minutes')
    }
  }
  this.maxBytes = config.maxBytes || 10 << 20
  this.processing = false
}

Plugin.prototype.start = function() {
  this.refresh()
  setInterval(this.refresh.bind(this), this.interval * 1000)
}

Plugin.prototype.stop = function(cb) {
  setInterval(this.onStop.bind(this, cb), this.interval * 100)
}

Plugin.prototype.onStop = function(cb) {
  if (!this.processing) {
    cb()
  }
}

Plugin.prototype.refresh = function() {
  var args = ['-o', 'json']
  if (this.meta.cursor) {
    args.push('--after-cursor')
    args.push(this.meta.cursor)
  }
  else {
    args.push('--since')
    args.push(this.meta.ts.format('YYYY-MM-DD HH:mm:ss'))
  }
  execFile('journalctl', args, {maxBuffer: this.maxSize}, this.onJournal.bind(this))
}

Plugin.prototype.onJournal = function(err, stdout, stderr) {
  try {
    if (err) {
      this.emitError(err)
      return
    }
    this.processing = true
    var event
    var lines = stdout.split('\n')
    var line
    for (line of lines) {
      try {
        if (line.length) {
          event = JSON.parse(line)
          this.emitEvent(event)
        }
      }
      catch (err) {
        this.emitError(err)
      }
    }
    if (event) {
      if (event.__CURSOR) {
        this.meta.cursor = event.__CURSOR
      }
      if (event.__REALTIME_TIMESTAMP) {
        this.meta.ts = moment.unix(event.__REALTIME_TIMESTAMP / 1000000)
      }
    }
    fs.writeFileSync(this.db, JSON.stringify(this.meta))
  }
  catch (err) {
    this.emitError(err)
  }
  finally {
    this.processing = false
  }
}

// Plugin.prototype.onLine = function(line) {
//   try {
//     this.emitEvent(JSON.parse(line))
//     this.lines++
//   }
//   catch (err) {
//     this.emitError(err)
//   }
// });

module.exports = Plugin
