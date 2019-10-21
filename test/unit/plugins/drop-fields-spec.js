
'use strict'

const _ = require('lodash')
const { Logbus } = require('../logbus.js')
const Plugin = require('../../../lib/plugins/drop-fields.js')

describe('plugin-drop-fields', () => {

  it('requires fields to drop', (done) => {
    expect(() => {
      const plugin = Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: fields/)
    done()
  })

  it('basically works!', (done) => {
    const logbus = Logbus('basic')
    const config = {
      fields: ['y'],
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput({x:1, y:2, z:3})
    plugin.onInput({x:1, z:3})
    plugin.onInput({})
    expect(logbus.errors).toEqual([])
    expect(logbus.events.length).toEqual(3)
    expect(logbus.events[0]).toEqual({x:1, z:3})
    expect(logbus.events[1]).toEqual({x:1, z:3})
    expect(logbus.events[2]).toEqual({})
    done()
  })

})
