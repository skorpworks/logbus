
'use strict'

const _ = require('lodash')
const { Logbus } = require('../logbus.js')
const Plugin = require('../../../lib/plugins/keep-fields.js')

describe('plugin-keep-fields', () => {

  it('requires fields to keep', (done) => {
    expect(() => {
      const plugin = Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: fields/)
    done()
  })

  it('basically works!', (done) => {
    const logbus = Logbus('basic')
    const config = {
      fields: {
        a: 'x',
        b: ['y', 'z'],
        c: 'dood',
      },
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput({x:1, y:2, z:3})
    plugin.onInput({x:1, z:3})
    plugin.onInput({})
    expect(logbus.errors).toEqual([])
    expect(logbus.events.length).toEqual(3)
    expect(logbus.events[0]).toEqual({a:1, b:2, c: undefined})
    expect(logbus.events[1]).toEqual({a:1, b:3, c: undefined})
    expect(logbus.events[2]).toEqual({a:undefined, b:undefined, c: undefined})
    done()
  })

})
