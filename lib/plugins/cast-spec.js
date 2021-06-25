
const _ = require('lodash')
const {Logbus} = require('../test/logbus')
const Plugin = require('./cast')

describe('plugin-cast', () => {
  it('requires fields to cast', () => {
    expect.assertions(1)
    expect(() => {
      Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: fields/u)
  })

  it('throws on unknown type', () => {
    expect.assertions(1)
    const config = {fields: {x: 'dood'}}
    expect(() => {
      Plugin(config, Logbus('config'))
    }).toThrow(/unsupported type: dood/u)
  })

  it('handles integers', () => {
    expect.assertions(2)
    const logbus = Logbus('integers')
    const config = {fields: {x: 'int'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '13.3'})
    plugin.onInput({x: '0'})
    plugin.onInput({x: '-42'})
    plugin.onInput({x: 'DOOD?'})
    expect(logbus.errors).toHaveLength(0)
    expect(_.map(logbus.events, 'x')).toStrictEqual([13, 0, -42, NaN])
  })

  it('handles floats', () => {
    expect.assertions(2)
    const logbus = Logbus('floats')
    const config = {fields: {x: 'float'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '13.3'})
    plugin.onInput({x: '0'})
    plugin.onInput({x: '-42.355'})
    plugin.onInput({x: 'DOOD?'})
    expect(logbus.errors).toHaveLength(0)
    expect(_.map(logbus.events, 'x')).toStrictEqual([13.3, 0, -42.355, NaN])
  })

  it('handles booleans', () => {
    expect.assertions(2)
    const logbus = Logbus('booleans')
    const config = {fields: {x: 'bool'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '13.3'})
    plugin.onInput({x: '0'})
    plugin.onInput({x: ''})
    plugin.onInput({x: 'false'})
    plugin.onInput({x: null})
    plugin.onInput({})
    plugin.onInput({x: ' '})
    expect(logbus.errors).toHaveLength(0)
    expect(_.map(logbus.events, 'x')).toStrictEqual([true, true, false, true, false, undefined, true]) // eslint-disable-line no-undefined
  })

  it('handles timestamps as seconds', () => {
    expect.assertions(4)
    const logbus = Logbus('seconds')
    const config = {fields: {x: 'ts-sec'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '1571603265'})
    plugin.onInput({x: 1571603265})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(2)
    expect(logbus.events[0].x.toISOString()).toStrictEqual('2019-10-20T20:27:45.000Z')
    expect(logbus.events[1].x.toISOString()).toStrictEqual('2019-10-20T20:27:45.000Z')
  })

  it('handles timestamps as milliseconds', () => {
    expect.assertions(4)
    const logbus = Logbus('seconds')
    const config = {fields: {x: 'ts-msec'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '1571603265042'})
    plugin.onInput({x: 1571603265042})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(2)
    expect(logbus.events[0].x.toISOString()).toStrictEqual('2019-10-20T20:27:45.042Z')
    expect(logbus.events[1].x.toISOString()).toStrictEqual('2019-10-20T20:27:45.042Z')
  })

  it('handles timestamps as microseconds', () => {
    expect.assertions(4)
    const logbus = Logbus('seconds')
    const config = {fields: {x: 'ts-usec'}}
    const plugin = Plugin(config, logbus)
    plugin.onInput({x: '1571603265042777'})
    plugin.onInput({x: 1571603265042777})
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(2)
    expect(logbus.events[0].x.toISOString()).toStrictEqual('2019-10-20T20:27:45.042Z')
    expect(logbus.events[1].x.toISOString()).toStrictEqual('2019-10-20T20:27:45.042Z')
  })
})
