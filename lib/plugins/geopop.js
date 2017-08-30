'use strict'

// Enrich event with geo data from event's POP.

const get = require('simple-get')
const request = require('sync-request')
const lodash = require('lodash')
const os = require('os')

function Plugin(config) {
  if (config.url === undefined) {
    config.url = ''
  }
  if (typeof(config.pop) !== 'function') {
    throw new Error('`pop` function not defined')
  }
  if (typeof(config.enrich) !== 'function') {
    throw new Error('`enrich` function not defined')
  }
  var sandbox = {
    hostname: require('os').hostname()
  }
  this.pop = config.pop.bind(sandbox)
  this.enrich = config.enrich.bind(sandbox)
  this.onApi = this.onApi.bind(this)
  if (typeof(config.test) === 'function') {
    this.test = config.test.bind(sandbox)
  }
  this.url = config.url
  this.cache = config.cache || {}
  this.outstanding = 0
}

Plugin.prototype.start = function(cb) {
  // Pre-populate cache with this host's POP data since will account for most events.
  // Do it syncronously to avoid initial flood.
  if (this.test) {
    return  // Don't bother when testing.
  }
  var pop = os.hostname().split(/[-.]/)[0].toUpperCase()
  var r = request('GET', this.url + pop, {
    headers: {'user-agent': 'logagent-js'},
    retry: true,
    timeout: 10000
  })
  if (r.statusCode === 200) {
    this.cache[pop] = JSON.parse(r.body)
    this.cache[pop].pop = pop
    this.log.info(this.cache[pop], 'cached')
  }
}

Plugin.prototype.stop = function(cb) {
  var self = this
  self.timer = setInterval(function() {
    if (self.outstanding === 0) {
      clearInterval(self.timer)
      cb()
    }
    else {
      self.log.debug(self.outstanding, 'outstanding geopop requests')
    }
  }, 100)
}

Plugin.prototype.onInput = function(event) {
  // TODO: Possible for multiple requests to get queued for a POP until first one gets into cache.
  // To fix, could keep track of which pops have outstanding api calls.
  try {
    var pop = this.pop(event)
    if (pop) {
      if (this.cache[pop]) {
        this.enrich(event, this.cache[pop])
        this.emitEvent(event)
      }
      else if (this.test) {
        this.enrich(event, this.test(pop))
        this.emitEvent(event)
      }
      else {
        this.outstanding++
        get.concat({
          url: this.url + pop,
          headers: {'user-agent': 'logagent-js'}
        }, lodash.partial(this.onApi.bind(this), pop, event))
      }
    }
  }
  catch (err) {
    this.emitError(err)
  }
}

Plugin.prototype.onApi = function (pop, event, err, res, data) {
  try {
    if (err) {
      this.emitError(err)
    }
    if (res && res.statusCode === 200 && Object.keys(data).length) {
      this.cache[pop] = JSON.parse(data)
      this.cache[pop].pop = pop
      this.enrich(event, this.cache[pop])
      this.log.debug(this.cache[pop], 'cached')
    }
    this.emitEvent(event)
  }
  catch (err) {
    this.emitError(err)
  }
  finally {
    this.outstanding--
  }
}

module.exports = Plugin
