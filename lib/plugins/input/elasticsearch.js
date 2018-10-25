'use strict'

// Query Elasticsearch using scroll api. Stop after scroll results exhausted or
// `max` hits processed. Each hit is emitted as-is downstream.
//
// Provide `index` pattern to search against and `scroll` time to keep the
// scroll results alive between searches. Define `search` body that adheres to
// the http search api:
//
//   https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html
//
// Example:
//
//   index: cool.beans
//   scroll: 1m
//   search:
//     size: 1000
//     query:
//       term:
//         garbanzo: yeee
//       query_string:
//         query: 'garbanzo:YEEE AND fava:NEEE'

const agent = require('superagent').agent();
const fs = require('fs')
const _ = require('lodash')

function resolvePath(filepath) {
  const path = require('path')
  if (filepath[0] === '~') {
    return path.join(process.env.HOME, filepath.slice(1))
  }
  return filepath
}

module.exports = (config, logbus) => {
  let scroll_id
  let total = 0

  if (!config.index) {
    throw new Error('undefined config: index')
  }
  if (!config.search) {
    throw new Error('undefined config: search')
  }
  const max = config.max || null
  const scroll = config.scroll || '1m'

  // Configure & wrap the request agent.
  agent.set('User-Agent', 'logbus')
  if (_.get(config, 'ssl.ca')) {
    agent.ca(fs.readFileSync(resolvePath(config.ssl.ca)))
  }
  function request(method, path) {
    const url = (config.endpoint || 'http://localhost:9200') + path
    return agent[method](url).http2(false).trustOrigins('.')
  }

  async function start() {
    return await request('get', '/')
      .then((response) => {
        const server = JSON.parse(response.text)
        request('get', `/${config.index}/_search`)
          .type('application/json')
          .query({scroll})
          .send(config.search)
          .then(onResponse)
          .catch((err) => {
            logbus.error(err)
            stop()
          })
        server.version = server.version.number
        delete server.tagline
        return {server, stage: logbus.stage}
      })
  }

  function stop() {
    let interval
    const wait = () => {
      if (logbus.ready) {
        clearInterval(interval)
        logbus.pipeline.emit('SIGTERM', 'end of search')
      }
    }
    logbus.log.info('done searching')
    request('delete', '/_search/scroll')
      .type('application/json')
      .send({scroll_id})
      .then((response) => {
        logbus.log.info(response.body, 'scroll deleted')
        if (logbus.ready) {
          logbus.pipeline.emit('SIGTERM', 'end of search')
        }
        else {
          logbus.log.warn('waiting for pipeline to fully start before stopping')
          interval = setInterval(wait, 100)
        }
      })
      .catch(logbus.error)
  }

  function onResponse(response) {
    scroll_id = _.get(response, 'body._scroll_id')
    const hits = _.get(response, 'body.hits.hits', [])
    if (hits.length === 0) {
      stop()
      return
    }
    hits.forEach(logbus.event)
    total += hits.length
    logbus.stats({events_in: hits.length})
    if (max != null && total >= max) {
      stop()
      return
    }
    if (scroll_id) {
      request('post', '/_search/scroll')
        .type('application/json')
        .send({scroll_id, scroll})
        .then(onResponse)
        .catch((err) => {
          logbus.error(err)
          stop()
        })
    }
  }

  // public api
  return { start }
}
