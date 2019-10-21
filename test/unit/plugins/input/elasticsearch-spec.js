
'use strict'

const _ = require('lodash')
const { Logbus } = require('../../logbus.js')
const Plugin = require('../../../../lib/plugins/input/elasticsearch.js')
const nock = require('nock')

// Default config with case specific overrides
function getConfig(props) {
  return _.merge({
    endpoint: 'http://localhost:9200',
    index: 'some-index',
    search: '{}',
  }, props)
}

async function waitForStop(logbus) {
  return await new Promise(resolve => {
    const wait = () => {
      // console.log('LOGS:', logbus.logs)
      // console.log('EVENTS:', logbus.events)
      if (logbus.shutdownReasons.length) {
        resolve(logbus.shutdownReasons)
      }
    }
    setInterval(wait, 10)
  })
}

describe('elasticsearch-input', () => {
  const events = {
    e1: {msg: 'Hi, Mom!'},
  }

  it('basically works!', async (done) => {
    const logbus = Logbus('basically works!')
    const config = getConfig({})
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    nock(config.endpoint)
      .get('/some-index/_search')
      .query(true)
      .reply(200, {
        _scroll_id: 'abc123',
        hits: {hits: [events.e1,]},
      })
    nock(config.endpoint)
      .post('/_search/scroll')
      .reply(200, {hits: {hits: []}})
    nock(config.endpoint)
      .delete('/_search/scroll')
      .reply(200, {})
    const x = await plugin.start()
    expect(x.server.version).toEqual('6.8.1')
    expect(x.server.cluster_name).toEqual('nocked')
    expect(x.stage).toEqual('basically works!')
    const reasons = await waitForStop(logbus)
    expect(logbus.logs.error).toEqual([])
    expect(logbus.errors).toEqual([])
    expect(reasons).toContain('end of search')
    expect(logbus.events).toEqual([events.e1])
    done()
  })

  it('supports dynamic index target', async (done) => {
    const logbus = Logbus('basically works!')
    const config = getConfig({
      index: function() {
        return `index-${this.moment().format('YYYY.MM')}.*`
      }
    })
    const plugin = Plugin(config, logbus)
    nock(config.endpoint)
      .get('/')
      .reply(200, {version: {number: '6.8.1'}, cluster_name: 'nocked'})
    nock(config.endpoint)
      .get(/index-2019.10.+\/_search/)
      .query(true)
      .reply(200, {
        _scroll_id: 'abc123',
        hits: {hits: [events.e1,]},
      })
    nock(config.endpoint)
      .delete('/_search/scroll')
      .reply(200, {})
    await plugin.start()
    plugin.stop(() => {
      expect(logbus.errors).toEqual([])
      expect(logbus.events).toEqual([events.e1])
      done()
    })
  })

  xit('stops after max results retrieved', async (done) => {
    done()
  })

  xit('will not stop until pipeline fully started', async (done) => {
    done()
  })
})
