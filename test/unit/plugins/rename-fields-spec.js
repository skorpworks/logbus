
'use strict'

const _ = require('lodash')
const { Logbus } = require('../logbus.js')
const Plugin = require('../../../lib/plugins/rename-fields.js')

describe('plugin-rename-fields', () => {

  it('requires fields to rename', (done) => {
    expect(() => {
      const plugin = Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: fields/)
    done()
  })

  it('basically works!', (done) => {
    const logbus = Logbus('basic')
    const config = {
      fields: {
        a: 'always',
        b: 'be',
        c: 'caring',
      },
    }
    const plugin = Plugin(config, logbus)
    plugin.onInput({a:1, b:null, c:undefined})
    plugin.onInput({a:false, b:'', c:[]})
    plugin.onInput({foo:'bar'})
    expect(logbus.errors).toEqual([])
    expect(logbus.events.length).toEqual(3)
    expect(logbus.events[0]).toEqual({always:1, be:null, c:undefined})
    expect(logbus.events[1]).toEqual({always:false, be:'', caring:[]})
    expect(logbus.events[2]).toEqual({foo:'bar'})
    done()
  })

})
