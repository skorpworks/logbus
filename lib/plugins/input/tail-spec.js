
'use strict'

const fs = require('fs')
const { Logbus } = require('../../test/logbus')
const Plugin = require('./tail')

const config = {
  intervalSeconds: 0.100,
  db: `${__dirname}/../../test/tail-db.json`,
  globs: [`${__dirname}/../../test/fixtures/input-tail/*.txt`],
  start: 0,
}

function clearMetaDb() {
  if (fs.existsSync(config.db)) {
    fs.unlinkSync(config.db)
  }
}

describe('tail-input', () => {
  beforeEach(clearMetaDb)
  afterEach(clearMetaDb)

  it('basically works!', async () => {
    expect.assertions(5)
    const logbus = Logbus('basically works!')
    const plugin = Plugin(config, logbus)
    await plugin.start()
    await logbus.wait(config.intervalSeconds * 1000 + 50, plugin.stop)
    // console.log('LOGS:', logbus.logs)
    expect(logbus.logs.error).toHaveLength(0)
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(6)
    expect(logbus.events[0]).toStrictEqual('a1')
    expect(logbus.events[1]).toStrictEqual('a2')
  })

  it('requires array of glob patterns', async () => {
    expect.assertions(1)
    expect(() => {
      Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: globs/)
  })
})
