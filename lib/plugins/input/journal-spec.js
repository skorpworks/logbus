
const fs = require('fs/promises')
const {Logbus} = require('../../test/logbus')
const Plugin = require('./journal')

const config = {
  intervalSeconds: 0.100,
  journalctl: `${__dirname}/../../test/journalctl`,
  db: `${__dirname}/../../test/journal-db.json`,
}

async function clearMetaDb() {
  try {
    await fs.unlink(config.db)
  } catch (err) {
    // ignore if file didn't already exist
  }
}

beforeEach(clearMetaDb)
afterEach(clearMetaDb)

describe('journal-input', () => {
  it('basically works!', async () => {
    expect.assertions(4)
    const logbus = Logbus('basically works!')
    const plugin = Plugin(config, logbus)
    await plugin.start()
    await logbus.wait((config.intervalSeconds * 1000) + 50, plugin.stop) // eslint-disable-line no-extra-parens
    // expect(logbus.logs.error).toHaveLength(0)
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events.length).toBeGreaterThan(1)
    expect(logbus.events[0].MESSAGE).toStrictEqual('start')
    expect(logbus.events[1].MESSAGE).toStrictEqual('msg-1')
  })
})
