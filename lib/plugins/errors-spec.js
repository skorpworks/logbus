
'use strict'

const { Logbus } = require('../test/logbus')
const Plugin = require('./errors')

describe('plugin-errors', () => {
  it('basically works!', async () => {
    expect.assertions(14)
    const logbus = Logbus('basic')
    const config = {intervalSeconds: 0.01, stackDepth: 2}
    const plugin = Plugin(config, logbus)
    plugin.start()
    plugin.onInput({stage: 'basic', stack: 'Error: DOOD!\n  at f1 (foo.js:10:4)\n  at f2 (bar.js:44:10)\n  at f3 (baz.js:22:6'})
    plugin.onInput({stage: 'basic', stack: 'Error: SWEET!\n  at f2 (bar.js:44:10)'})
    plugin.onInput({stage: 'basic', stack: 'Error: DOOD!\n  f2 (bar.js:44:10)\n  at f3 (baz.js:22:6'})
    await logbus.wait(12, () => {
      plugin.onInput({stage: 'basic', stack: 'Error: SWEET!\n  at f2 (bar.js:44:10)'})
    })
    plugin.stop()
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(3)
    const [e1, e2, e3] = logbus.events
    // console.log(logbus.events)
    expect(e1.message).toStrictEqual('basic: Error: DOOD!')
    expect(e1.count).toStrictEqual(2)
    expect(e1.stack).toHaveLength(2)
    expect(e1.stack[0]).toStrictEqual('  at f1 (foo.js:10:4)')
    expect(e1.stack[1]).toStrictEqual('  at f2 (bar.js:44:10)')
    expect(e1.severity).toStrictEqual(3)
    // errors aggregated by first line of stack
    expect(e2.message).toStrictEqual('basic: Error: SWEET!')
    expect(e2.count).toStrictEqual(1)
    expect(e2.stack).toHaveLength(1)
    expect(e2.stack[0]).toStrictEqual('  at f2 (bar.js:44:10)')
    // 3rd error emitted after 10ms, so not aggregated with prior one.
    expect(e3.message).toStrictEqual('basic: Error: SWEET!')
    expect(e3.count).toStrictEqual(1)
  })
})
