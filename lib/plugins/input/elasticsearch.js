'use strict'

// Query Elasticsearch using scroll api. Stop after scroll results exhausted or
// `max` hits processed. Each hit is emitted as-is downstream.
//
// Define `search` that adheres to the javascript search api:
//
//   https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/15.x/api-reference.html#api-search
//
// Example:
//
//   search:
//     index: cool.beans
//     scroll: 1m
//     size: 1000
//     q: 'garbanzo:yeee'

const Elasticsearch = require('elasticsearch')
const _ = require('lodash')

function Plugin(config) {
  this.search = config.search
  if (!this.search) {
    throw new Error('undefined config: search')
  }
  this.total = 0
  this.max = config.max || null
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

Plugin.prototype.start = function() {
  this.run()
}

Plugin.prototype._stop = function() {
  this.client.clearScroll({scroll_id: this.scroll_id}, () => {
    this.pipeline.emit('SIGTERM', 'end of search')
  })
}

Plugin.prototype.run = function() {
  this.client.search(this.search, this.onResponse)
}

Plugin.prototype.onResponse = function(err, response) {
  let hits = _.get(response, 'hits.hits', [])
  if (err) {
    this.emitError(err)
  } else {
    hits.forEach(this.emitEvent)
    this.total += hits.length
    this.emitStats({events_in: hits.length})
    if (this.max != null && this.total >= this.max) {
      this._stop()
      return
    }
    if (hits.length > 0 && response._scroll_id) {
      this.log.debug('more to scroll...')
      this.scroll_id = response._scroll_id
      this.client.scroll({scroll: this.search.scroll, scrollId: response._scroll_id}, this.onResponse)
    }
  }
  if (err || hits.length === 0) {
    this._stop()
  }
}

module.exports = Plugin
