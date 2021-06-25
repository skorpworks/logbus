
// UNSUPPORTED: Enrich event with geo data from event's POP.

const os = require('os')
const agent = require('superagent').agent()
agent.set('User-Agent', 'logbus')

module.exports = (config, logbus) => {
  if (config.url == null) {
    config.url = ''
  }
  const sandbox = {
    hostname: require('os').hostname()
  }
  if (typeof config.pop !== 'function') {
    throw new Error('`pop` function not defined')
  }
  const getPop = config.pop.bind(sandbox)
  if (typeof config.enrich !== 'function') {
    throw new Error('`enrich` function not defined')
  }
  const enrich = config.enrich.bind(sandbox)
  let test = null
  if (typeof config.test === 'function') {
    test = config.test.bind(sandbox)
  }
  const cache = config.cache || {}
  let outstanding = 0

  async function start() {
    // Pre-populate cache with this host's POP data since will account for most events.
    // Do it syncronously to avoid initial flood.
    if (test) {
      return // Don't bother when testing.
    }
    const pop = os.hostname().split(/[-.]/u)[0].toUpperCase()
    const r = await agent.get(config.url + pop).retry(3).timeout(10000)
    cache[pop] = r.body
    cache[pop].pop = pop
    logbus.log.info(cache[pop], 'cached')
  }

  function stop() {
    if (outstanding > 0) {
      // TODO: wait until outstanding == 0
    }
  }

  const onApi = (pop, event, err, res, data) => {
    try {
      if (err) {
        logbus.error(err)
      }
      if (res && res.statusCode === 200 && Object.keys(data).length) {
        cache[pop] = JSON.parse(data)
        cache[pop].pop = pop
        enrich(event, cache[pop])
        logbus.log.debug(cache[pop], 'cached')
      }
      logbus.event(event)
    } catch (exc) {
      logbus.error(exc)
    } finally {
      outstanding--
    }
  }

  const onInput = async event => {
    // TODO: Possible for multiple requests to get queued for a POP until first one gets into cache.
    // To fix, could keep track of which pops have outstanding api calls.
    try {
      const pop = getPop(event)
      if (pop) {
        if (cache[pop]) {
          enrich(event, cache[pop])
          logbus.event(event)
        } else if (test) {
          enrich(event, test(pop))
          logbus.event(event)
        } else {
          outstanding++
          const r = await agent.get(config.url + pop).retry(3).timeout(10000)
          onApi(pop, event, null, r, r.body)
        }
      }
    } catch (err) {
      logbus.error(err)
    }
  }

  return {start, stop, onInput}
}
