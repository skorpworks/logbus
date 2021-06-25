
const fs = require('fs/promises')
const {Logbus} = require('../../test/logbus')
const Plugin = require('./tail')

const config = {
  intervalSeconds: 0.100,
  db: `${__dirname}/../../test/tail-db.json`,
  globs: [`${__dirname}/../../test/fixtures/input-tail/*.txt`],
  start: 0,
}

async function clearMetaDb() {
  try {
    await fs.unlink(config.db)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('unabled to remove test db:', config.db)
    }
  }
}

beforeEach(clearMetaDb)
afterEach(clearMetaDb)

describe('tail-input', () => {
  it('basically works!', async () => {
    expect.assertions(4)
    const logbus = Logbus('basically works!')
    const plugin = Plugin(config, logbus)
    await plugin.start()
    await logbus.wait((config.intervalSeconds * 1000) + 50, plugin.stop) // eslint-disable-line no-extra-parens
    expect(logbus.errors).toHaveLength(0)
    expect(logbus.events).toHaveLength(6)
    // cannot gaurantee that a.txt will be processed before b.txt but can verify
    // that lines from each file are processed in order.
    const aaa = []
    const bbb = []
    for (const val of logbus.events) {
      if (val[0] === 'a') {
        aaa.push(val)
      } else {
        bbb.push(val)
      }
    }
    expect(aaa.sort()).toStrictEqual(aaa)
    expect(bbb.sort()).toStrictEqual(bbb)
  })

  it('requires array of glob patterns', () => {
    expect.assertions(1)
    expect(() => {
      Plugin({}, Logbus('config'))
    }).toThrow(/undefined config: globs/u)
  })
})
