'use strict'

// Tail files that match `globs` and emit lines. Globs will be re-evaluated
// every `interval` seconds. File metadata (start, age) stored in `db`. Start
// tailing from `start` position on new files (defaults to end of file).

// TODO: Better to emit as bytes and let downstream stages deal with char sets
// and chunking (lines vs N bytes)?  Would require our own tail-forever.

var fs = require('fs')
var Tail = require('tail-forever')
var glob = require('glob')

function Plugin(config) {
  if (config.globs === undefined) {
    throw new Error('`globs` to tail not defined')
  }
  this.globs = config.globs
  this.interval = config.interval || 600
  this.db = config.db || (this.name + '.taildb')
  this.startPosition = config.start != null ? config.start : null
  this.globopts = {
    strict: true,
    silent: false,
    noglobstar: true,
    realpath: true
  }
  this.tails = {}
  if (fs.existsSync(this.db)) {
    this.meta = JSON.parse(fs.readFileSync(this.db))
  } else {
    this.meta = {}
  }
  this.lines = 0
  this.bytes = 0
}

Plugin.prototype.start = function() {
  this.refresh()
  setInterval(this.refresh.bind(this), this.interval * 1000)
  setInterval(this.stats.bind(this), 60 * 1000)
}

Plugin.prototype.stats = function() {
  let lines = this.lines
  this.lines = 0
  let bytes = this.bytes
  this.bytes = 0
  this.emitStats({lines_in: lines, bytes_in: bytes})
}

Plugin.prototype.stop = function(cb) {
  this.stopWatching() // this is synchronous but brittle to assume?
  cb()
}

Plugin.prototype.stopWatching = function() {
  // Stop tailing files (ie close) and save current metadata.
  for (var path in this.tails) {
    var meta = this.tails[path].unwatch()
    if (this.meta[path] === undefined) {
      this.meta[path] = {}
    }
    this.meta[path].start = meta.pos
    this.meta[path].inode = meta.inode
  }
  fs.writeFileSync(this.db, JSON.stringify(this.meta))
}

Plugin.prototype.refresh = function() {
  this.stopWatching()
  // Reset open file map using glob matches.
  this.tails = {}
  for (var pattern of this.globs) {
    glob(pattern, this.globopts, this.glob.bind(this))
  }
}

Plugin.prototype.glob = function(err, paths) {
  if (err) {
    this.emitError(err)
  }
  for (var path of paths) {
    var stat = fs.statSync(path)
    var opts = {start: this.startPosition, inode: stat.ino}
    if (this.meta[path]) {
      // In case of file truncation, start back at 0.
      if (stat.size < this.meta[path].start) {
        opts.start = 0
      }
      // In case of file rotation, start back at 0.
      else if (stat.ino !== this.meta[path].inode) {
        opts.start = 0
      }
      else {
        opts.start = this.meta[path].start
      }
    }
    this.log.debug({path: path, start: opts.start}, 'tailing file')
    this.tails[path] = new Tail(path, opts)
    this.tails[path].on('line', this.onLine.bind(this))
  }
}

Plugin.prototype.onLine = function(line) {
  try {
    this.emitEvent(line)
    this.lines++
    this.bytes += line.length
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin
