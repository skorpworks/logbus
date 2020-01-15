
'use strict'

const fs = require('fs')
const { Logbus } = require('../../test/logbus')
const Plugin = require('./journal')

const config = {
  intervalSeconds: 0.015,
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
    await logbus.wait(30, plugin.stop)
    expect(logbus.logs.error).toHaveLength(0)
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(2)
    expect(logbus.events[0].MESSAGE).toStrictEqual('start')
    expect(logbus.events[1].MESSAGE).toStrictEqual('msg-1')
  })
})
