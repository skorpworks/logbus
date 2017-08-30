'use strict'

// Read files that match `globs` on startup and emit strings as `encoding` in
// `chunkSize` chunks. Throttle reading at `maxMbps`. Will exit once all globbed
// files fully consumed - see the tail plugin for watching files indefinitely.

const Throttle = require('stream-throttle').Throttle
const fs = require('fs')
const glob = require('glob')
const lodash = require('lodash')

function Plugin(config) {
  if (config.globs === undefined) {
    throw new Error('`globs` to tail not defined')
  }
  this.globs = config.globs
  this.globopts = {
    strict: true,
    silent: false,
    noglobstar: true,
    realpath: true
  }
  this.paths = {}
  this.maxbps = (config.maxMbps || 100) << 20
  this.encoding = config.encoding || 'utf8'
}

Plugin.prototype.start = function() {
  var path, pattern
  for (pattern of this.globs) {
    for (path of glob.sync(pattern, this.globopts)) {
      this.paths[path] = true
    }
  }
  for (path in this.paths) {
    // Lesson learned: don't share Throttle instances across streams.  Don't cross the streams!
    var stream = fs.createReadStream(path).pipe(new Throttle({rate: this.maxbps}))
    stream.on('end', lodash.partial(this.onEOF.bind(this), path))
    stream.on('data', this.onData.bind(this))
    stream.on('error', this.emitError.bind(this))
  }
}

Plugin.prototype.onEOF = function(path) {
  this.log.info('finished', path)
  delete this.paths[path]
  if (Object.keys(this.paths).length === 0) {
    this.pipeline.emit('SIGTERM', 'end of all files')
  }
}

Plugin.prototype.onData = function(data) {
  this.emitEvent(data.toString(this.encoding))
  this.emitStats({bytes_in: Buffer.byteLength(data)})
}

module.exports = Plugin
