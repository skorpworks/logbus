
'use strict'

const { Logbus } = require('../../test/logbus')
const Plugin = require('./json')

describe('plugin-serialize-json', () => {
  it('basically works!', () => {
    expect.assertions(3)
    const logbus = Logbus('basic')
    const plugin = Plugin({delimiter: ''}, logbus)
    plugin.onInput({i: 42})
    // console.log('LOGS:', logbus.logs)
    // console.log('ERRORS:', logbus.errors)
    // console.log('EVENTS:', logbus.events)
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(1)
    const event = logbus.events[0]
    expect(event).toStrictEqual('{"i":42}')
  })

  it('some serialization errors are caught', () => {
    expect.assertions(4)
    const logbus = Logbus('bigint')
    const plugin = Plugin({}, logbus)
    plugin.onInput({a: BigInt(42)}) // eslint-disable-line no-undef
    expect(logbus.events).toHaveLength(0)
    expect(logbus.errors).toHaveLength(1)
    const err = logbus.errors[0]
    expect(err.name).toStrictEqual('TypeError')
    expect(err.message).toMatch(/do not know how to serialize/i)
  })

  it('most unknown types ignored', () => {
    expect.assertions(3)
    const logbus = Logbus('unknown')
    const plugin = Plugin({}, logbus)
    plugin.onInput({i: 42, f: () => 'Hi, Mom!'})
    expect(logbus.events).toHaveLength(1)
    expect(logbus.errors).toHaveLength(0)
    const event = logbus.events[0]
    expect(event).toStrictEqual('{"i":42}\n')
  })
})
