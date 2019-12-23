
'use strict'

const { Logbus } = require('../../test/unit/logbus')
const Plugin = require('./sample')

describe('plugin-sample', () => {
  it('requires either `nth` or `intervalSeconds`', () => {
    expect.assertions(1)
    expect(() => {
      Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: nth or intervalSeconds/)
  })

  it('requires `nth` > 0', () => {
    expect.assertions(1)
    expect(() => {
      Plugin({nth: 0}, Logbus('config'))
    }).toThrow(/invalid config: nth must be > 0/)
  })

  it('requires `intervalSeconds` > 0', () => {
    expect.assertions(1)
    expect(() => {
      Plugin({intervalSeconds: 0}, Logbus('config'))
    }).toThrow(/invalid config: intervalSeconds must be > 0/)
  })

  it('can sample at 50%', () => {
    expect.assertions(4)
    const logbus = Logbus('sample at 50%')
    const config = {nth: 2}
    const plugin = Plugin(config, logbus)
    plugin.onInput({n: 1})
    plugin.onInput({n: 2})
    plugin.onInput({n: 3})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(2)
    expect(logbus.events[0]).toStrictEqual({n: 1})
    expect(logbus.events[1]).toStrictEqual({n: 3})
  })

  async function wait(ms, f) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(f())
      }, ms)
    })
  }

  it('can sample every 10 ms', async () => {
    expect.assertions(6)
    const logbus = Logbus('sample at 10ms')
    const config = {intervalSeconds: 0.01}
    const plugin = Plugin(config, logbus)
    await plugin.start()
    plugin.onInput({n: 1})
    await wait(5, () => {
      plugin.onInput({n: 2})
      expect(logbus.events).toHaveLength(0)
    })
    await wait(10, () => {
      plugin.onInput({n: 3})
      expect(logbus.events).toHaveLength(1)
    })
    await wait(10, () => {})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(2)
    expect(logbus.events[0]).toStrictEqual({n: 2})
    expect(logbus.events[1]).toStrictEqual({n: 3})
  })

  it('can sample at 50% and every 10 ms', async () => {
    expect.assertions(8)
    const logbus = Logbus('sample at 10ms')
    const config = {nth: 2, intervalSeconds: 0.01}
    const plugin = Plugin(config, logbus)
    await plugin.start()
    plugin.onInput({n: 1})
    await wait(5, () => {
      expect(logbus.events).toHaveLength(1)
    })
    await wait(10, () => {
      expect(logbus.events).toHaveLength(1)
      plugin.onInput({n: 2})
    })
    await wait(10, () => {
      expect(logbus.events).toHaveLength(2)
      plugin.onInput({n: 3})
    })
    plugin.onInput({n: 4})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(3)
    expect(logbus.events[0]).toStrictEqual({n: 1})
    expect(logbus.events[1]).toStrictEqual({n: 2})
    expect(logbus.events[2]).toStrictEqual({n: 3})
  })
})
