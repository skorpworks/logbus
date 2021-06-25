
// Apply `enrich(event, geodata)`. The results from `ip()` will be used to query
// geo database located at `path`.

const _ = require('lodash')

function loadGeoDb(path) {
  return new Promise((resolve, reject) => {
    require('maxmind-db-reader').open(path, (err, data) => {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

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

  let db = null
  let getGeoData = null
  if (typeof config.test === 'function') {
    // allow tests to mock the geodb call.
    getGeoData = config.test.bind(sandbox)
  } else if (config.path) {
    getGeoData = ip => {
      return new Promise((resolve, reject) => {
        resolve(db.getGeoData(ip), (err, data) => {
          if (err) {
            reject(err)
          } else {
            resolve(data)
          }
        })
      })
    }
  } else if (config.path == null) {
    throw new Error('undefined config: path')
  }

  async function start() {
    if (config.path) {
      db = await loadGeoDb(config.path)
    }
    return {stage: logbus.stage}
  }

  async function onInput(event) {
    try {
      const ip = address(event)
      if (ip) {
        if (!cache[ip]) {
          cache[ip] = await getGeoData(ip) // eslint-disable-line require-atomic-updates
        }
        if (!_.empty(cache[ip])) {
          enrich(event, cache[ip])
        }
      }
    } catch (err) {
      logbus.error(err)
    }
    // Let event travel downstream, enriched or not.
    logbus.event(event)
  }

  return {start, onInput}
}
