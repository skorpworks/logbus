
const {Logbus} = require('../test/logbus')
const Plugin = require('./js')

describe('plugin-js', () => {
  const events = {
    e1: {msg: 'Hi, Mom!', cool: true},
    e2: {msg: 'Hi, Jabroney!'},
  }

  it('basically works!', () => {
    expect.assertions(3)
    const logbus = Logbus('basically works!')
    const config = {
      function(event, channel) {
        if (event.cool) {
          event.channel = channel
          return event
        }
        return null
      }
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput(events.e1, 'chan1')
    plugin.onInput(events.e2, 'chan1')
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(1)
    expect(logbus.events[0]).toStrictEqual(events.e1)
  })

  it('requires user-defined function', () => {
    expect.assertions(1)
    expect(() => {
      Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: function/u)
  })

  it('catches errors', () => {
    expect.assertions(2)
    const logbus = Logbus('errors')
    const err = new Error('DERP!')
    const config = {
      function() {
        throw err
      }
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput(events.e1)
    expect(logbus.errors).toStrictEqual([err])
    expect(logbus.events).toHaveLength(0)
  })

  it('supports flushing state on shutdown', async () => {
    expect.assertions(2)
    const logbus = Logbus('last call')
    const config = {
      count: 0,
      function() {
        this.config.count += 1
      },
      lastCall() {
        return new Promise(resolve => {
          const count = this.config.count
          setTimeout(() => resolve({msg: `processed ${count} events`}), 10)
        })
      },
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput(events.e1)
    plugin.onInput(events.e2)
    await plugin.stop()
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toStrictEqual([{msg: 'processed 2 events'}])
  })
})
