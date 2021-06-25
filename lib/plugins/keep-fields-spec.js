
const {Logbus} = require('../test/logbus')
const Plugin = require('./keep-fields')

describe('plugin-keep-fields', () => {
  it('requires fields to keep', () => {
    expect.assertions(1)
    expect(() => {
      Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: fields/u)
  })

  it('basically works!', () => {
    expect.assertions(5)
    const logbus = Logbus('basic')
    const config = {
      fields: {
        a: 'x',
        b: ['y', 'z'],
        c: 'dood',
      },
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: 1, y: 2, z: 3})
    plugin.onInput({x: 1, z: 3})
    plugin.onInput({})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(3)
    expect(logbus.events[0]).toEqual({a: 1, b: 2})
    expect(logbus.events[1]).toEqual({a: 1, b: 3})
    expect(logbus.events[2]).toEqual({})
  })
})
