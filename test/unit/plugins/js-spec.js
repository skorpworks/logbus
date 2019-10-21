
'use strict'

const _ = require('lodash')
const { Logbus } = require('../logbus.js')
const Plugin = require('../../../lib/plugins/js.js')

describe('plugin-js', () => {
  const events = {
    e1: {msg: 'Hi, Mom!', cool: true},
    e2: {msg: 'Hi, Jabroney!'},
  }

  it('basically works!', (done) => {
    const logbus = Logbus('basically works!')
    const config = {
      function: function(event, channel) {
        if (event.cool) {
          event.channel = channel
          return event
        }
      }
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput(events.e1, 'chan1')
    plugin.onInput(events.e2, 'chan1')
    expect(logbus.logs.error).toEqual([])
    expect(logbus.errors).toEqual([])
    expect(logbus.events.length).toEqual(1)
    expect(logbus.events[0]).toEqual(events.e1)
    done()
  })

  it('requires user-defined function', (done) => {
    expect(() => {
      const plugin = Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: function/)
    done()
  })

  it('catches errors', (done) => {
    const logbus = Logbus('errors')
    const err = new Error('DERP!')
    const config = {
      function: function(event, channel) {
        throw err
      }
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput(events.e1)
    expect(logbus.logs.error).toEqual([])
    expect(logbus.errors).toEqual([err])
    expect(logbus.events.length).toEqual(0)
    done()
  })

  it('supports flushing state on shutdown', (done) => {
    const logbus = Logbus('last call')
    const config = {
      count: 0,
      function: function(event) {
        this.config.count += 1
      },
      lastCall: function(event) {
        return {msg: `processed ${this.config.count} events`}
      },
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput(events.e1)
    plugin.onInput(events.e2)
    plugin.stop(() => {
      expect(logbus.errors).toEqual([])
      expect(logbus.events).toEqual([{msg: 'processed 2 events'}])
      done()
    })
  })
})
