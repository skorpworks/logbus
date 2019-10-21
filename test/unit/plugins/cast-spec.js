
'use strict'

const _ = require('lodash')
const moment = require('moment')
const { Logbus } = require('../logbus.js')
const Plugin = require('../../../lib/plugins/cast.js')

describe('plugin-cast', () => {

  it('requires fields to cast', (done) => {
    expect(() => {
      const plugin = Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: fields/)
    done()
  })

  it('throws on unknown type', (done) => {
    const config = {fields: {x: 'dood'}}
    expect(() => {
      const plugin = Plugin(config, Logbus('config'))
    }).toThrow(/unsupported type: dood/)
    done()
  })

  it('handles integers', (done) => {
    const logbus = Logbus('integers')
    const config = {fields: {x: 'int'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '13.3'})
    plugin.onInput({x: '0'})
    plugin.onInput({x: '-42'})
    plugin.onInput({x: 'DOOD?'})
    expect(logbus.errors).toEqual([])
    expect(_.map(logbus.events, 'x')).toEqual([13, 0, -42, NaN])
    done()
  })

  it('handles floats', (done) => {
    const logbus = Logbus('floats')
    const config = {fields: {x: 'float'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '13.3'})
    plugin.onInput({x: '0'})
    plugin.onInput({x: '-42.355'})
    plugin.onInput({x: 'DOOD?'})
    expect(logbus.errors).toEqual([])
    expect(_.map(logbus.events, 'x')).toEqual([13.3, 0, -42.355, NaN])
    done()
  })

  it('handles booleans', (done) => {
    const logbus = Logbus('booleans')
    const config = {fields: {x: 'bool'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '13.3'})
    plugin.onInput({x: '0'})
    plugin.onInput({x: ''})
    plugin.onInput({x: 'false'})
    plugin.onInput({x: null})
    plugin.onInput({x: undefined})
    plugin.onInput({x: ' '})
    expect(logbus.errors).toEqual([])
    expect(_.map(logbus.events, 'x')).toEqual([true, true, false, true, false, false, true])
    done()
  })

  it('handles timestamps as seconds', (done) => {
    const logbus = Logbus('seconds')
    const config = {fields: {x: 'ts-sec'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '1571603265'})
    plugin.onInput({x: 1571603265})
    expect(logbus.errors).toEqual([])
    expect(logbus.events.length).toEqual(2)
    expect(logbus.events[0].x.toISOString()).toEqual('2019-10-20T20:27:45.000Z')
    expect(logbus.events[1].x.toISOString()).toEqual('2019-10-20T20:27:45.000Z')
    done()
  })

  it('handles timestamps as milliseconds', (done) => {
    const logbus = Logbus('seconds')
    const config = {fields: {x: 'ts-msec'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '1571603265042'})
    plugin.onInput({x: 1571603265042})
    expect(logbus.errors).toEqual([])
    expect(logbus.events.length).toEqual(2)
    expect(logbus.events[0].x.toISOString()).toEqual('2019-10-20T20:27:45.042Z')
    expect(logbus.events[1].x.toISOString()).toEqual('2019-10-20T20:27:45.042Z')
    done()
  })

  it('handles timestamps as microseconds', (done) => {
    const logbus = Logbus('seconds')
    const config = {fields: {x: 'ts-usec'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '1571603265042777'})
    plugin.onInput({x: 1571603265042777})
    expect(logbus.errors).toEqual([])
    expect(logbus.events.length).toEqual(2)
    expect(logbus.events[0].x.toISOString()).toEqual('2019-10-20T20:27:45.042Z')
    expect(logbus.events[1].x.toISOString()).toEqual('2019-10-20T20:27:45.042Z')
    done()
  })

})
