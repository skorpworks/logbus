
// Ship to Elasticsearch `endpoint` every `intervalSeconds`. Will also ship once
// `bufferSize` number of events queued up. The `endpoint` can be defined as
// either a string or function.
//
// Elasticsearch responses from the /_bulk index operations will be emitted on `outChannels`.

const agent = require('superagent').agent()
const fs = require('fs/promises')
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
  let inflight = 0
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
  let endpoint = null
  if (typeof config.endpoint === 'function') {
    endpoint = config.endpoint.bind(sandbox)
  } else {
    endpoint = () => config.endpoint || 'http://localhost:9200'
  }

  // Configure & wrap the request agent.
  agent.set('User-Agent', 'logbus')
  function request(method, path) {
    return agent[method](endpoint() + path).http2(false)
  }

  function ship() {
    if (buffer.length) {
      inflight++
      // Save a copy so can continue buffering while indexing.
      const copy = buffer
      buffer = []
      logbus.log.info({events: copy.length / 2}, 'indexing')
      request('post', '/_bulk').
        type('application/x-ndjson').
        send(copy.map(JSON.stringify).join('\n')).
        send('\n').
        then(response => {
          let success = 0
          let failed = 0
          for (const item of _.get(response, 'body.items', [])) {
            if (_.get(item, 'index.error')) {
              failed++
              let stack = item.index.error.reason
              if (item.index.error.caused_by) {
                // This contains the more generic error details which is better for grouping.
                stack = `${item.index.error.caused_by.type}\n${stack}`
              }
              logbus.error({stack})
            } else {
              success++
            }
          }
          logbus.log.info({success, failed}, 'indexed')
          logbus.stats({errors: failed, events_out: copy.length / 2}) // eslint-disable-line camelcase
          logbus.event(response.body)
          inflight--
        }).
        catch(err => {
          logbus.error(err)
          inflight--
        })
    }
  }

  let timer = null

  async function start() {
    if (_.get(config, 'ssl.ca')) {
      agent.ca(await fs.readFile(resolvePath(config.ssl.ca)))
    }
    inflight++
    const response = await request('get', '/')
    const server = response.body
    timer = setInterval(ship, intervalSeconds * 1000)
    inflight--
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
    } catch (err) {
      logbus.error(err, docmeta)
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
    }
    ship() // flush buffered events
    return new Promise(resolve => {
      const wait = () => {
        if (inflight > 0) {
          logbus.log.debug({inflight}, 'waiting for bulk index requests')
          setTimeout(wait, 100)
        } else {
          if (inflight < 0) {
            console.warn({inflight}, 'some how ended up with negative inflight count')
            logbus.log.warn({inflight}, 'some how ended up with negative inflight count')
          }
          resolve()
        }
      }
      wait()
    })
  }

  return {start, onInput, stop}
}
