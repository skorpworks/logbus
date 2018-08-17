'use strict'

// Index to Elasticsearch every `interval` seconds. Will also index once buffer
// of size `bufferSize` gets filled.
//
// Elasticsearch responses from the index operations will be emitted on `outChannels`.

const Elasticsearch = require('elasticsearch')
const sizeof = require('object-sizeof')
const lodash = require('lodash')

function Plugin(config) {
  this.bufferSize = config.bufferSize || 1000
  this.interval = config.interval || 60
  this.index = config.index
  if (typeof this.index === 'function') {
    this.index = this.index.bind({
      util: require('util'),
      moment: require('moment')
    })
  }
  this.type = config.type || 'event'
  this.buffer = []
  var client = {}
  if (config.hosts !== undefined) {
    // TODO: support ssl paths?
    //  client.ssl.ca = fs.readFileSync(config.ssl.ca)
    // TODO: credential storage?
    client.hosts = config.hosts
  }
  if (config.api !== undefined) {
    client.apiVersion = config.api
  }
  this.client = new Elasticsearch.Client(client)
  this.onResponse = this.onResponse.bind(this)
}

Plugin.prototype.onInput = function(doc) {
  try {
    // TODO: Profile this.  Worried this type checking & function calls not worth the expensive here.
    var index = doc._index || this.index
    if (typeof index === 'function') {
      index = index(doc)
    }
    var _type = doc._type || this.type
    var _id = doc._id
    delete doc._index
    delete doc._type
    delete doc._id
    this.buffer.push({index: {_index: index, _type: _type, _id: _id}})
    this.buffer.push(doc)
    if (this.buffer.length >= 2 * this.bufferSize) {
      this.run()
    }
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.start = function() {
  setInterval(this.run.bind(this), this.interval * 1000)
}

Plugin.prototype.stop = function(cb) {
  this.run(cb)
}

Plugin.prototype.run = function(cb) {
  // Save a copy so can continue buffering while indexing.
  var buffer = this.buffer
  this.buffer = []
  this.log.info({events: buffer.length / 2}, 'indexing')
  if (buffer.length) {
    this.client.bulk({body: buffer}, lodash.partial(this.onResponse, cb))
    this.emitStats({events_out: buffer.length / 2, bytes_out: sizeof(buffer)})
  }
  else if (cb) {
    cb()
  }
}

Plugin.prototype.onResponse = function(cb, err, response) {
  if (err) {
    this.emitError(err)
  } else {
    var success = 0
    var failed = 0
    for (var i of response.items) {
      if (i.index) {
        if (i.index.error) {
          failed++
          // TODO: What should do with these?
          this.log.warn('failed to index', {type: i.index._type, id: i.index._id, error: i.index.error.toString()})
          this.emitError({stage: 'elasticsearch', stack: i.index.error.toString().split('\n')})
        }
        else {
          success++
        }
      }
    }
    this.log.info({success: success, failed: failed}, 'indexed')
    // this.emitEvent(response)
  }
  if (cb) {
    cb()
  }
}

module.exports = Plugin
