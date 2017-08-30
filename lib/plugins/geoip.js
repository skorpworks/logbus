'use strict'

// Enrich event with geoip data.

const maxmind = require('maxmind-db-reader')

function Plugin(config) {
  if (typeof(config.ip) !== 'function') {
    throw new Error('`ip` function not defined')
  }
  if (typeof(config.enrich) !== 'function') {
    throw new Error('`enrich` function not defined')
  }
  var sandbox = {}
  this.ip = config.ip.bind(sandbox)
  this.enrich = config.enrich.bind(sandbox)
  if (typeof(config.test) === 'function') {
    // Allow tests to mock the maxmind call.
    this.getGeoData = config.test.bind(sandbox)
  }
  else if (config.path !== undefined) {
    // this.getGeoData = maxmind.openSync(config.path).getGeoDataSync
    // Something is derpy with maxmind module.  This hack works.
    var db = maxmind.openSync(config.path)
    this.getGeoData = function(ip) { return db.getGeoDataSync(ip) }
  }
  else {
    throw new Error('`path` to db not defined')
  }
  this.cache = config.cache || {}
}

Plugin.prototype.onInput = function(event) {
  try {
    var ip = this.ip(event)
    if (ip) {
      if (this.cache[ip] === undefined) {
        this.cache[ip] = this.getGeoData(ip)
      }
      if (this.cache[ip] && Object.keys(this.cache[ip]).length) {
        this.enrich(event, this.cache[ip])
      }
    }
    this.emitEvent(event)
  }
  catch (err) {
    this.emitError(err)
    // Let event travel downstream without being enriched.
    this.emitEvent(event)
  }
}

module.exports = Plugin
