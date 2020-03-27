
'use strict'

const _ = require('lodash')
const { Logbus } = require('../../test/logbus')
const Plugin = require('./elasticsearch')
const nock = require('nock')

// Default config with case specific overrides
// - `scope` needed to isolate nocked responses across test cases
function getConfig(scope, props) {
  return _.merge({
    endpoint: `http://localhost:9200/${scope}`,
    index: 'some-index',
    search: {},
  }, props)
}

async function waitForStop(logbus) {
  return new Promise(resolve => {
    const wait = () => {
      // console.log('LOGS:', logbus.logs)
      // console.log('EVENTS:', logbus.events)
      if (logbus.shutdownReasons.length) {
        resolve(logbus.shutdownReasons)
      } else {
        setTimeout(wait, 10)
      }
    }
    wait()
  })
}

describe('elasticsearch-input', () => {
  const events = {
    e1: {msg: 'Hi, Mom!'},
    e2: {msg: 'You da man now, dawg!'},
  }

  it('basically works!', async () => {
    expect.assertions(7)
    const logbus = Logbus('basically works!')
    const config = getConfig('basic', {})
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    nock(config.endpoint)
      .post('/some-index/_search')
      .query(true)
      .reply(200, {
        _scroll_id: 'abc123',
        hits: {hits: [events.e1]},
      })
    nock(config.endpoint)
      .post('/_search/scroll')
      .reply(200, {hits: {hits: []}})
    nock(config.endpoint)
      .delete('/_search/scroll')
      .reply(200, {})
    const x = await plugin.start()
    expect(x.server.version).toStrictEqual('6.8.1')
    expect(x.server.cluster_name).toStrictEqual('nocked')
    expect(x.stage).toStrictEqual('basically works!')
    const reasons = await waitForStop(logbus)
    expect(logbus.logs.error).toHaveLength(0)
    expect(logbus.errors).toHaveLength(0)
    expect(reasons).toContain('end of search')
    expect(logbus.events).toStrictEqual([events.e1])
  })

  it('supports dynamic index target', async () => {
    expect.assertions(3)
    const logbus = Logbus('dynamic index')
    const config = getConfig('dynamic', {
      index: function() {
        return `index-${this.moment().format('YYYY.MM')}.*`
      }
    })
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    nock(config.endpoint)
      .post(/index-[*.0-9]+\/_search/)
      .query(true)
      .reply(200, {
        _scroll_id: 'abc123',
        hits: {hits: [events.e1]},
      })
    nock(config.endpoint)
      .post('/_search/scroll')
      .query(true)
      .reply(200, {_scroll_id: 'abc123', hits: []})
    nock(config.endpoint)
      .delete('/_search/scroll')
      .reply(200, {})
    await plugin.start()
    const reason = await plugin.stop()
    expect(reason).toStrictEqual('end of search')
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toStrictEqual([events.e1])
  })

  it('stops once max results reached', async () => {
    expect.assertions(3)
    const logbus = Logbus('max results')
    const config = getConfig('max', {max: 1})
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    nock(config.endpoint)
      .post('/some-index/_search')
      .query(true)
      .reply(200, {
        _scroll_id: 'abc123',
        hits: {hits: [events.e1]},
      })
    nock(config.endpoint)
      .post('/some-index/_search')
      .query(true)
      .reply(200, {
        _scroll_id: 'abc123',
        hits: {hits: [events.e2]},
      })
    nock(config.endpoint)
      .post('/_search/scroll')
      .query(true)
      .reply(200, {_scroll_id: 'abc123', hits: []})
    nock(config.endpoint)
      .delete('/_search/scroll')
      .reply(200, {})
    await plugin.start()
    const reason = await plugin.stop()
    expect(reason).toStrictEqual('max results')
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toStrictEqual([events.e1])
  })

  it('stops on search failure', async () => {
    expect.assertions(5)
    const logbus = Logbus('failure')
    const config = getConfig('failure', {})
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    nock(config.endpoint)
      .post('/some-index/_search')
      .query(true)
      .reply(500)
    await plugin.start()
    const reason = await plugin.stop()
    expect(reason).toStrictEqual('search error')
    expect(logbus.errors).toHaveLength(1)
    const err = logbus.errors[0]
    expect(err.name).toStrictEqual('Error')
    expect(err.message).toStrictEqual('Internal Server Error')
    expect(logbus.events).toHaveLength(0)
  })

  it.todo('will not stop until pipeline fully started')
})
