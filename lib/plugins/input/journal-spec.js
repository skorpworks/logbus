
'use strict'

const fs = require('fs')
const { Logbus } = require('../../test/logbus')
const Plugin = require('./journal')

const config = {
  // TODO: plugin needs to protect against parallel refresh before lowering the interval
  intervalSeconds: 0.100,
  journalctl: `${__dirname}/../../test/journalctl`,
  db: `${__dirname}/../../test/journal-db.json`,
}

function clearMetaDb() {
  if (fs.existsSync(config.db)) {
    fs.unlinkSync(config.db)
  }
}

describe('journal-input', () => {
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
    expect(logbus.events.length).toBeGreaterThan(1)
    expect(logbus.events[0].MESSAGE).toStrictEqual('start')
    expect(logbus.events[1].MESSAGE).toStrictEqual('msg-1')
  })
})
