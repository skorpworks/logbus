
'use strict'

const { Logbus } = require('../../../test/unit/logbus')
const Plugin = require('./yaml')

describe('plugin-serialize-yaml', () => {
  it('basically works!', () => {
    expect.assertions(3)
    const logbus = Logbus('basic')
    const plugin = Plugin({delimiter: ''}, logbus)
    plugin.onInput({a: 42, b: true, c: null, d: ['1', 2], e: 0.0})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(1)
    const event = logbus.events[0]
    expect(event).toStrictEqual("a: 42\nb: true\nc: null\nd:\n  - '1'\n  - 2\ne: 0\n")
  })

  it('undefined values not supported', () => {
    expect.assertions(4)
    const logbus = Logbus('undefined')
    const plugin = Plugin({}, logbus)
    plugin.onInput({a: undefined})
    expect(logbus.events).toHaveLength(0)
    expect(logbus.errors).toHaveLength(1)
    const err = logbus.errors[0]
    expect(err.name).toStrictEqual('YAMLException')
    expect(err.message).toMatch(/unacceptable kind .* undefined/i)
  })
})
