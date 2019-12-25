
'use strict'

const _ = require('lodash')
const { Logbus } = require('../../test/logbus')
const Plugin = require('./elasticsearch')
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

  it('basically works!', async () => {
    expect.assertions(5)
    const logbus = Logbus('basically works!')
    const config = getConfig({})
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    const x = await plugin.start()
    expect(x.server.version).toStrictEqual('6.8.1')
    expect(x.server.cluster_name).toStrictEqual('nocked')
    expect(x.stage).toStrictEqual('basically works!')
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.logs.error).toHaveLength(0)
  })

  it('flushes unshipped events', async () => {
    expect.assertions(3)
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
    expect(logbus.events).toHaveLength(0)
    nock(config.endpoint)
      .post('/_bulk')
      .reply(200, {
        items: [events.e1],
      })
    // should ship when stop() called
    await plugin.stop()
    // console.log('STATS:', logbus._stats)
    // console.log('ERRORS:', logbus.errors)
    // console.log('LOGS:', logbus.logs)
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toStrictEqual([{items: [events.e1]}])
  })

  it('waits for inflight requests', async () => {
    expect.assertions(3)
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
    await plugin.stop()
    expect(logbus.errors).toHaveLength(0)
    expect(_.map(logbus.logs.debug, (i) => i[0])).toContain('waiting for inflight requests')
    expect(logbus.events).toStrictEqual([{items: [events.e1]}])
  })

  it('supports dynamic endpoint', async () => {
    expect.assertions(1)
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
    expect(x.server.cluster_name).toStrictEqual('nocked')
  })

  it.todo('reports bulk request errors')
  // , async () => {
  //   const logbus = Logbus('reports bulk request errors')
  // })

  it.todo('supports custom cert authority')
  // , async () => {
  //   const logbus = Logbus('supports custom cert authority')
  //   const config = getConfig({
  //     ssl: {
  //       ca: 'ca.crt',
  //     }
  //   })
  //   const plugin = Plugin(config, logbus)
  //   expect().toStrictEqual('DOOD')
  // })
})
