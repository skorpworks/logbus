'use strict'

// Ship to Elasticsearch every `intervalSeconds`. Will also ship once
// `bufferSize` number of events queued up.
//
// Elasticsearch responses from the /_bulk index operations will be emitted on `outChannels`.

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
  let buffer = []
  let inflight = false
  const bufferSize = config.bufferSize || 1000
  let intervalSeconds = config.intervalSeconds || 60
  if (config.interval) {
    logbus.log.warn('`interval` config option deprecated - use `intervalSeconds`')
    intervalSeconds = config.interval
  }

  if (typeof config.index === 'function') {
    throw new Error('callable `index` no longer supported - use `js` stage upstream')
  }

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
    inflight = true
    return await request('get', '/')
      .then((response) => {
        const server = JSON.parse(response.text)
        setInterval(ship, intervalSeconds * 1000)
        inflight = false
        server.version = server.version.number
        delete server.tagline
        return {server, stage: logbus.stage}
      })
  }

  function onInput(doc) {
    const docmeta = {
      _index: doc._index || config.index || 'logbus',
      _type: doc._type || config.type || 'event',
      _id: doc._id,
    }
    try {
      delete doc._index
      delete doc._type
      delete doc._id
      buffer.push({index: docmeta})
      buffer.push(doc)
      if (buffer.length >= 2 * bufferSize) {
        ship()
      }
    }
    catch (err) {
      logbus.error(err, docmeta)
    }
  }

  function stop(cb) {
    let interval
    if (!inflight) {
      ship() // flush buffered events
    }
    const wait = () => {
      logbus.log.warn('waiting for inflight requests')
      if (!inflight) {
        clearInterval(interval)
        cb()
      }
    }
    interval = setInterval(wait, 100)
  }

  function ship() {
    if (buffer.length) {
      // Save a copy so can continue buffering while indexing.
      const copy = buffer
      buffer = []
      logbus.log.info({events: copy.length / 2}, 'indexing')
      inflight = true
      request('post', '/_bulk')
        .type('application/x-ndjson')
        .send(copy.map(JSON.stringify).join('\n'))
        .send('\n')
        .then((response) => {
          // logbus.log.debug(response.text)
          let success = 0
          let failed = 0
          try {
            const results = JSON.parse(response.text)
            results.items.forEach((item) => {
              if (item.index) {
                if (item.index.error) {
                  failed++
                  logbus.log.debug({err: item.index.error}, 'failed to index')
                  logbus.error({stage: 'elasticsearch', stack: item.index.error.toString().split('\n')})
                }
                else {
                  success++
                }
              }
            })
            logbus.log.info({success: success, failed: failed}, 'indexed')
            logbus.stats({events_out: copy.length / 2})
            logbus.event(results)
          }
          catch (err) {
            logbus.error(err)
          }
          inflight = false
        })
        .catch((err) => {
          // logbus.log.error(err)
          logbus.error(err)
          inflight = false
        })
    }
  }

  return { start, onInput, stop }
}
