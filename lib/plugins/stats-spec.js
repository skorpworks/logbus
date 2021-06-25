
const {Logbus} = require('../test/logbus')
const Plugin = require('./stats')

describe('plugin-stats', () => {
  it('basically works!', async () => {
    expect.assertions(10)
    const logbus = Logbus('basic')
    const config = {intervalSeconds: 0.01}
    const plugin = Plugin(config, logbus)
    plugin.start()
    plugin.onInput({errors: 1, foo: 1})
    plugin.onInput({errors: 2, events_out: 2}) // eslint-disable-line camelcase
    await logbus.wait(12, plugin.stop)
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(2)
    const stats = logbus.events[0]
    expect(stats.message).toStrictEqual('errors[3] events[in=0 out=2] lines[in=0 out=0] mbytes[in=0 out=0]')
    expect(stats.errors).toStrictEqual(3)
    expect(stats.events_in).toStrictEqual(0)
    expect(stats.events_out).toStrictEqual(2)
    expect(stats.foo).toBeUndefined()
    expect(stats.heapMB).toBeGreaterThan(0)
    expect(stats.rssMB).toBeGreaterThan(0)
    expect(logbus.events[1].message).toStrictEqual('errors[0] events[in=0 out=0] lines[in=0 out=0] mbytes[in=0 out=0]')
  })
})
