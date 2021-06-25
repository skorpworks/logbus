
// Query Elasticsearch using scroll api. Stop after scroll results exhausted or
// `max` hits processed. Each hit is emitted as-is downstream.
//
// Provide `index` pattern to search against and `scroll` time to keep the
// scroll results alive between searches. Define `search` body that adheres to
// the http search api:
//
//   https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html
//
// Basic example:
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
//
// Example with dynamic index which might be useful for down-sampling older data:
//
//   index: !!js/function >-
//     function() {
//       const ts = this.moment.utc().subtract(1, 'day')
//       return 'logbus.journal-' + ts.format('YYYY.MM.DD')
//     }
//   scroll: 1m
//   search:
//     size: 1000
//     query:
//       query_string:
//         query: 'event.severity:<6'

// At time of writing, version 6.8 is targeted.  Other versions may not work.
//
// https://www.elastic.co/guide/en/elasticsearch/reference/6.8/search-request-scroll.html

const agent = require('superagent').agent()
const fs = require('fs/promises')
const os = require('os')
const _ = require('lodash')
const util = require('util')
const moment = require('moment')

function resolvePath(filepath) {
  const path = require('path')
  if (filepath[0] === '~') {
    return path.join(process.env.HOME, filepath.slice(1))
  }
  return filepath
}

module.exports = (config, logbus) => {
  let scrollId = null
  let total = 0
  let stopped = null

  const sandbox = {
    config,
    util,
    moment,
    math: Math,
    hostname: os.hostname(),
  }
  if (!config.index) {
    throw new Error('undefined config: index')
  }
  let index = () => config.index
  if (typeof config.index === 'function') {
    index = config.index.bind(sandbox)
  }
  if (!config.search) {
    throw new Error('undefined config: search')
  }
  if (!config.search.sort) {
    // Scroll requests have optimizations that make them faster when the sort
    // order is _doc. If you want to iterate over all documents regardless of
    // the order, this is the most efficient option.
    config.search.sort = ['_doc']
  }

  const max = config.max || null
  const scroll = config.scroll || '1m'

  // Configure & wrap the request agent.
  agent.set('User-Agent', 'logbus')
  function request(method, path) {
    const url = (config.endpoint || 'http://localhost:9200') + path
    return agent[method](url).http2(false) // .trustOrigins('.')
  }

  async function _stop(reason) {
    logbus.log.info(`asked to stop: ${reason}`)
    if (scrollId) {
      const response = await request('delete', '/_search/scroll').
        type('application/json').
        send({scroll_id: scrollId}) // eslint-disable-line camelcase
      logbus.log.info(response.body, 'scroll deleted')
    }
    // TODO: not sure it matters much if this set here or just before resolve()
    stopped = reason
    // TODO: provide a way to `await logbus.waitForReady()`
    return new Promise(resolve => {
      const wait = () => {
        if (logbus.ready) {
          logbus.pipeline.emit('SIGTERM', 'end of search')
          resolve()
        } else {
          logbus.log.warn('waiting for pipeline to fully start before stopping')
          setTimeout(wait, 100)
        }
      }
      wait()
    })
  }

  function onResults(results) {
    if (!scrollId) {
      // initialize only once
      // TODO: the scroll_id can change
      scrollId = _.get(results, 'body._scroll_id')
    }
    const hits = _.get(results, 'body.hits.hits', [])
    if (hits.length === 0) {
      _stop('end of search')
      return
    }
    hits.forEach(logbus.event)
    total += hits.length
    logbus.stats({events_in: hits.length}) // eslint-disable-line camelcase
    if (max != null && total >= max) {
      _stop('max results')
      return
    }
    if (scrollId) {
      request('post', '/_search/scroll').
        type('application/json').
        send({scroll, scroll_id: scrollId}). // eslint-disable-line camelcase
        then(onResults).
        catch(err => {
          logbus.error(err)
          _stop('scroll error')
        })
    }
  }

  async function start() {
    if (_.get(config, 'ssl.ca')) {
      try {
        agent.ca(await fs.readFile(resolvePath(config.ssl.ca)))
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logbus.error(err, `failed to read trusted ca certs: ${config.ssl.ca}`)
        }
      }
    }
    const home = await request('get', '/')
    const server = home.body
    server.version = server.version.number
    delete server.tagline
    // intentionally not waiting on results loop
    setTimeout(() => {
      request('post', `/${index()}/_search`).
        type('application/json').
        query({scroll}).
        send(config.search).
        then(onResults).
        catch(err => {
          logbus.error(err)
          _stop('search error')
        })
    }, 10)
    return {server, stage: logbus.stage}
  }

  function stop() {
    logbus.log.info('waiting to stop')
    return new Promise(resolve => {
      const wait = () => {
        if (stopped) {
          resolve(stopped)
        } else {
          setTimeout(wait, 100)
        }
      }
      wait()
    })
  }

  return {start, stop}
}
