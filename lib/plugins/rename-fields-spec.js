
const {Logbus} = require('../test/logbus')
const Plugin = require('./rename-fields')

describe('plugin-rename-fields', () => {
  it('requires fields to rename', () => {
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
        a: 'always',
        b: 'be',
        c: 'caring',
      },
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput({a: 1, b: null})
    plugin.onInput({a: false, b: '', c: []})
    plugin.onInput({foo: 'bar'})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(3)
    expect(logbus.events[0]).toStrictEqual({always: 1, be: null})
    expect(logbus.events[1]).toStrictEqual({always: false, be: '', caring: []})
    expect(logbus.events[2]).toStrictEqual({foo: 'bar'})
  })
})
