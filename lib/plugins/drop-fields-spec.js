
'use strict'

const { Logbus } = require('../test/logbus')
const Plugin = require('./drop-fields')

describe('plugin-drop-fields', () => {
  it('requires fields to drop', () => {
    expect.assertions(1)
    expect(() => {
      Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: fields/)
  })

  it('basically works!', () => {
    expect.assertions(5)
    const logbus = Logbus('basic')
    const config = {
      fields: ['y'],
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput({x:1, y:2, z:3})
    plugin.onInput({x:1, z:3})
    plugin.onInput({})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(3)
    expect(logbus.events[0]).toStrictEqual({x:1, z:3})
    expect(logbus.events[1]).toStrictEqual({x:1, z:3})
    expect(logbus.events[2]).toStrictEqual({})
  })
})
