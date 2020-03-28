
'use strict'

const { Logbus } = require('../../test/logbus')
const Plugin = require('./file')

async function waitForStop(logbus) {
  return new Promise(resolve => {
    const wait = () => {
      if (logbus.shutdownReasons.length) {
        resolve(logbus.shutdownReasons)
      } else {
        setTimeout(wait, 1000)
      }
    }
    wait()
  })
}

describe('file-input', () => {
  const events = {
    e0: 'a1\na2\na3\n',
    e1: 'b1\nb2\nb3\n',
  }

  it('basically works!', async () => {
    expect.assertions(6)
    const logbus = Logbus('basically works!')
    const config = {globs: [`${__dirname}/../../test/fixtures/input-file/*.txt`]}
    const plugin = Plugin(config, logbus)
    await plugin.start()
    const reasons = await waitForStop(logbus)
    expect(logbus.logs.error).toHaveLength(0)
    expect(logbus.errors).toHaveLength(0)
    expect(reasons).toContain('end of all files')
    expect(logbus.events).toHaveLength(2)
    expect(logbus.events[0]).toStrictEqual(events.e0)
    expect(logbus.events[1]).toStrictEqual(events.e1)
  })

  it('requires array of glob patterns', async () => {
    expect.assertions(1)
    expect(() => {
      Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: globs/)
  })

  it('waits for pipeline to start', async () => {
    expect.assertions(4)
    const logbus = Logbus('pipeline start')
    const config = {globs: [`${__dirname}/../../test/fixtures/input-file/*.txt`]}
    const plugin = Plugin(config, logbus)
    logbus.ready = false
    await plugin.start()
    await logbus.wait(20, () => {
      logbus.ready = true
    })
    const reasons = await waitForStop(logbus)
    expect(logbus.logs.warn).toHaveLength(1)
    expect(logbus.errors).toHaveLength(0)
    expect(reasons).toContain('end of all files')
    expect(logbus.events).toHaveLength(2)
  })
})
