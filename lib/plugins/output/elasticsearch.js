'use strict'

// Ship to Elasticsearch `endpoint` every `intervalSeconds`. Will also ship once
// `bufferSize` number of events queued up. The `endpoint` can be defined as
// either a string or function.
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

  const sandbox = {
    config,
    env: process.env,
    util: require('util'),
  }
  let endpoint
  if (typeof config.endpoint === 'function') {
    endpoint = config.endpoint.bind(sandbox)
  } else {
    endpoint = () => config.endpoint || 'http://localhost:9200'
  }

  // Configure & wrap the request agent.
  agent.set('User-Agent', 'logbus')
  if (_.get(config, 'ssl.ca')) {
    agent.ca(fs.readFileSync(resolvePath(config.ssl.ca)))
  }
  function request(method, path) {
    return agent[method](endpoint() + path).http2(false)
  }

  async function start() {
    inflight = true
    const response = await request('get', '/')
    const server = response.body
    setInterval(ship, intervalSeconds * 1000)
    inflight = false
    server.version = server.version.number
    delete server.tagline
    return {server, stage: logbus.stage}
  }

  function onInput(doc) {
    const docmeta = {
      _index: doc._index || config.index || 'logbus',
      _type: doc._type || config.type || '_doc',
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
      logbus.log.debug('waiting for inflight requests')
      if (!inflight) {
        clearInterval(interval)
        cb()
      }
    }
    interval = setInterval(wait, 100)
  }

  async function ship() {
    if (buffer.length) {
      inflight = true
      // Save a copy so can continue buffering while indexing.
      const copy = buffer
      buffer = []
      logbus.log.info({events: copy.length / 2}, 'indexing')
      try {
        const response = await request('post', '/_bulk')
          .type('application/x-ndjson')
          .send(copy.map(JSON.stringify).join('\n'))
          .send('\n')
        let success = 0
        let failed = 0
        response.body.items.forEach((item) => {
          if (_.get(item, 'index.error')) {
            failed++
            let stack = item.index.error.reason
            if (item.index.error.caused_by) {
              // This contains the more generic error details which is better for grouping.
              stack = `${item.index.error.caused_by.type}\n${stack}`
            }
            logbus.error({stack})
          }
          else {
            success++
          }
        })
        logbus.log.info({success: success, failed: failed}, 'indexed')
        logbus.stats({errors: failed, events_out: copy.length / 2})
        logbus.event(response.body)
      }
      catch (err) {
        logbus.error(err)
      }
      inflight = false
    }
  }

  return { start, onInput, stop }
}
