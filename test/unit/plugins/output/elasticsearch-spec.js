
'use strict'

const _ = require('lodash')
const { Logbus } = require('../../logbus.js')
const Plugin = require('../../../../lib/plugins/output/elasticsearch.js')
const nock = require('nock')

// Default config with case specific overrides
function getConfig(props) {
  return _.merge({
    endpoint: 'http://localhost:9200',
    bufferSize: 1,
  }, props)
}

describe('elasticsearch-output', () => {
  const events = {
    e1: {foo: 'bar', msg: 'Hi, Mom!'},
  }

  it('basically works!', async (done) => {
    const logbus = Logbus('basically works!')
    const config = getConfig({})
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    const x = await plugin.start()
    expect(x.server.version).toEqual('6.8.1')
    expect(x.server.cluster_name).toEqual('nocked')
    expect(x.stage).toEqual('basically works!')
    expect(logbus.errors).toEqual([])
    expect(logbus.logs.error).toEqual([])
    done()
  })

  it('flushes unshipped events', async (done) => {
    const logbus = Logbus('flushes unshipped events')
    const config = getConfig({
      bufferSize: 2,
    })
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    await plugin.start()
    plugin.onInput(events.e1)
    // should not have shipped anything since bufferSize > 1
    expect(logbus.events).toEqual([])
    nock(config.endpoint)
      .post('/_bulk')
      .reply(200, {
        items: [events.e1],
      })
    // should ship when stop() called
    plugin.stop(() => {
      // console.log('STATS:', logbus._stats)
      // console.log('ERRORS:', logbus.errors)
      // console.log('LOGS:', logbus.logs)
      expect(logbus.errors).toEqual([])
      expect(logbus.events).toEqual([{items: [events.e1]}])
      done()
    })
  })

  it('waits for inflight requests', async (done) => {
    const logbus = Logbus('waits for inflight requests')
    const config = getConfig({})
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    await plugin.start()
    nock(config.endpoint)
      .post('/_bulk')
      .delayBody(200)
      .reply(200, {
        items: [events.e1],
      })
    plugin.onInput(events.e1)
    plugin.stop(() => {
      expect(logbus.errors).toEqual([])
      expect(_.map(logbus.logs.debug, (i) => i[0])).toContain('waiting for inflight requests')
      expect(logbus.events).toEqual([{items: [events.e1]}])
      done()
    })
  })

  it('supports dynamic endpoint', async (done) => {
    const logbus = Logbus('supports dynamic endpoint')
    const config = getConfig({
      username: 'jabroney',
      password: 'jones',
      endpoint: function() {
        return `http://${this.config.username}:${this.config.password}@localhost:9200`
      }
    })
    const plugin = Plugin(config, logbus)
    nock(config.endpoint.call({config}))
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    const x = await plugin.start()
    expect(x.server.cluster_name).toEqual('nocked')
    done()
  })

  xit('reports bulk request errors', async (done) => {
    const logbus = Logbus('reports bulk request errors')
    done()
  })

  xit('supports custom cert authority', async (done) => {
    const logbus = Logbus('supports custom cert authority')
    const config = getConfig({
      ssl: {
        ca: 'ca.crt',
      }
    })
    // const plugin = Plugin(config, logbus)
    // expect().toEqual('DOOD')
    done()
  })
})
