'use strict'

// Apply `enrich(event, geodata)`. The results from `ip()` will be used to query
// geo database located at `path`.

const _ = require('lodash')

module.exports = (config, logbus) => {
  if (typeof config.ip !== 'function') {
    throw new Error('undefined config: ip')
  }
  if (typeof config.enrich !== 'function') {
    throw new Error('undefined config: enrich')
  }
  const cache = config.cache || {}
  const sandbox = {}
  const enrich = config.enrich.bind(sandbox)
  const address = config.ip.bind(sandbox)
  let getGeoData

  function start() {
    return new Promise((resolve, reject) => {
      if (typeof config.test === 'function') {
        // Allow tests to mock the geodb call.
        getGeoData = config.test.bind(sandbox)
      }
      else if (config.path !== undefined) {
        const db = require('maxmind-db-reader').openSync(config.path)
        getGeoData = ip => db.getGeoDataSync(ip)
      }
      else {
        reject('undefined config: path')
      }
      resolve({stage: logbus.stage})
    })
  }

  function onInput(event) {
    try {
      const ip = address(event)
      if (ip) {
        if (cache[ip] === undefined) {
          cache[ip] = getGeoData(ip)
        }
        if (!_.empty(cache[ip])) {
          enrich(event, cache[ip])
        }
      }
    }
    catch (err) {
      logbus.error(err)
    }
    // Let event travel downstream, enriched or not.
    logbus.event(event)
  }

  return { start, onInput }
}
