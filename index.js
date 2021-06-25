#!/usr/bin/env node

// const log = require('why-is-node-running')
// setTimeout(function () {
//   log() // logs out active handles that are keeping node running
// }, 3000)

const USAGE = `
Process logs from configured pipeline.

Usage: COMMAND [options] <config>

Options:
  -v, --verbosity LEVEL
    trace, debug, info, warn, error, fatal [default: warn]
  -c, --check
    Validate pipeline
  --timeout SECONDS
    How long to give stages to stop on pipeline shutdown [default: 10]
`

const EXITS = {
  SUCCESS: 0,
  CONFIG: 1,
  TIMEOUT: 2,
  START: 21,
  EXCEPTION: 42,
}

const EventEmitter = require('events')
const util = require('util')
const path = require('path')
const _ = require('lodash')
const fs = require('fs/promises')

const yaml = require('js-yaml')
const unsafe = require('js-yaml-js-types').all
const schema = yaml.DEFAULT_SCHEMA.extend(unsafe)

const newStage = require('./stage')

const MODULES = {
  'file-in': './lib/plugins/input/file',
  'file-out': './lib/plugins/output/file',
  'json-in': './lib/plugins/parse/json',
  'json-out': './lib/plugins/serialize/json',
  'tcp-in': './lib/plugins/input/tcp',
  journal: './lib/plugins/input/journal',
  tail: './lib/plugins/input/tail',
  'yaml-in': './lib/plugins/parse/yaml',
  'yaml-out': './lib/plugins/serialize/yaml',
  agg: './lib/plugins/agg',
  cast: './lib/plugins/cast',
  drop: './lib/plugins/drop-fields',
  'elasticsearch-in': './lib/plugins/input/elasticsearch',
  'elasticsearch-log': './lib/plugins/parse/elasticsearch',
  'elasticsearch-out': './lib/plugins/output/elasticsearch',
  elasticsearch: './lib/plugins/output/elasticsearch', // DEPRECATED
  'kafka-broker-log': './lib/plugins/parse/kafka-broker',
  'kafka-in': './lib/plugins/input/kafka',
  'kafka-out': './lib/plugins/output/kafka',
  errors: './lib/plugins/errors',
  gc: './lib/plugins/gc',
  geoip: './lib/plugins/geoip',
  geopop: './lib/plugins/geopop',
  js: './lib/plugins/js',
  keep: './lib/plugins/keep-fields',
  lines: './lib/plugins/parse/lines',
  log: './lib/plugins/log',
  pass: './lib/plugins/pass',
  rename: './lib/plugins/rename-fields',
  sample: './lib/plugins/sample',
  sql: './lib/plugins/sql',
  stats: './lib/plugins/stats',
  stdin: './lib/plugins/input/stdin',
  stdout: './lib/plugins/output/stdout',
}

const flows = stages => {
  // Generate all paths that end here.
  const genpaths = function *(name) {
    const stage = stages[name]
    if (!stage) {
      return yield [{reason: 'UNDEFINED', name}]
    }
    if (stage.isInput) {
      return yield [{reason: 'INPUT', name}]
    }
    const paths = []
    stage.inputs(stages).forEach(input => {
      // TODO: Detect loops
      const pathiter = genpaths(input)
      for (let i = pathiter.next(); !i.done; i = pathiter.next()) {
        paths.push(i.value.concat([{name}]))
      }
    })
    if (paths.length === 0) {
      if (stage.isErrors) {
        return yield [{reason: 'ERRORS', name}]
      } else if (stage.isStats) {
        return yield [{reason: 'STATS', name}]
      }
      return yield [{reason: 'DEADEND', name}]
    }
    return yield* paths
  }
  const paths = []
  _.each(stages, (stage, name) => {
    if (stage.outputs(stages).length === 0) {
      // Start at stages with no outputs and work our way back.
      const pathiter = genpaths(name)
      for (let i = pathiter.next(); !i.done; i = pathiter.next()) {
        if (stage.isOutput) {
          i.value[i.value.length - 1].reason = 'OUTPUT'
        } else {
          i.value[i.value.length - 1].reason = 'DEADEND'
        }
        paths.push(i.value)
      }
    }
  })
  return paths
}

async function main() {
  const bunyan = require('bunyan')
  const argv = require('docopt').docopt(USAGE)
  const log = bunyan.createLogger({
    name: process.argv[1].split('/').pop(),
    level: bunyan[argv['--verbosity'].toUpperCase()],
  })
  const config = yaml.load(await fs.readFile(argv['<config>']), {schema})
  const basedir = path.resolve(path.dirname(argv['<config>']))

  const stages = {}

  // shutdown handling
  const shutdown = {
    timeout: parseFloat(argv['--timeout']) * 1000,
    graceful() {
      let ready = true
      _.each(stages, (stage, name) => {
        if (!stage.stopped()) {
          ready = false
          log.info(name, 'waiting on', Object.keys(stage.waitingOn).join(',') || 'SELF')
        }
      })
      if (ready) {
        log.info('all stages shut down cleanly')
        process.exit(EXITS.SUCCESS)
      }
    },
    dirty() {
      log.error('timed out waiting for pipeline to shut down')
      process.exit(EXITS.TIMEOUT)
    },
    start(reason) {
      // TODO: Put "wait for startup" logic here so plugins need not worry about it (see input/elasticsearch).
      log.info('shutting down', {reason})
      // stop all input, error, & stats channels.  Dependent stages should follow.
      // TODO: use async/await
      // TODO: stop input stages first, then stats, then errors
      _.each(stages, stage => {
        if (stage.isInput || stage.isErrors || stage.isStats) {
          stage.stop()
        }
      })
      setInterval(shutdown.graceful, 1000)
      setTimeout(shutdown.dirty, shutdown.timeout)
    },
  }

  // Exit non-success on unhandled exception, particularly useful so supervisors
  // can restart the service when configured to do so.
  process.on('uncaughtException', err => {
    console.error(err, 'uncaught exception')
    shutdown.start('EXCEPTION')
  })
  process.on('SIGINT', () => shutdown.start('SIGINT'))
  process.on('SIGQUIT', () => shutdown.start('SIGQUIT'))
  process.on('SIGTERM', () => shutdown.start('SIGTERM'))

  const events = new EventEmitter()
  events.setMaxListeners(999)
  events.on('SIGTERM', reason => shutdown.start(reason))

  if (config.plugins) {
    _.each(config.plugins, (props, name) => {
      MODULES[name] = props.path
      if (MODULES[name][0] !== '/') {
        MODULES[name] = path.join(basedir, MODULES[name])
      }
    })
  }
  const TEMPLATES = {}
  if (config.templates) {
    for (const ns in config.templates) { // eslint-disable-line guard-for-in
      const props = config.templates[ns]
      if (props.path[0] !== '/') {
        props.path = path.join(basedir, props.path)
      }
      TEMPLATES[ns] = yaml.load(await fs.readFile(props.path), {schema})
    }
  }

  // load the pipeline
  _.each(config.pipeline, (stage, name) => {
    if (stage.template) {
      const [ns, template] = stage.template.split('.')
      if (!TEMPLATES[ns]) {
        throw new Error(`undefined stage template: ${stage.template}`)
      }
      stage = _.merge({}, TEMPLATES[ns][template], stage) // eslint-disable-line no-param-reassign
    }
    if (!stage.module) {
      stage.module = name
    }
    try {
      // The logbus api exposed to plugins.
      const logbus = {
        ready: false,
        stage: name,
        log: log.child({stage: name}),
        pipeline: events,
      }
      const plugin = require(MODULES[stage.module] || stage.module)(stage.config || {}, logbus)
      // TODO: This sucks - all kinds of odd coupling twix stage, plugin, and logbus instance
      stage.outChannels = stage.outChannels || plugin.outChannels || [name]
      logbus.event = event => {
        if (event) {
          stage.outChannels.forEach(chan => events.emit(chan, event, name))
        }
      }
      logbus.stats = data => {
        data.stage = name
        events.emit(stage.statsChannel || 'stats', data)
      }
      logbus.error = err => {
        err.stage = name
        events.emit(stage.errChannel || 'errors', err)
      }
      stages[name] = newStage(name, stage, plugin, logbus)
    } catch (err) {
      log.error(err, 'failed to load stage: %s', name)
    }
  })
  _.each(stages, (stage, name) => {
    stage.inputs(stages).forEach(input => {
      log.debug(util.format('%s waits on %s', name, input))
      stage.waitOn(input)
      events.once(input + '.stopped', stage.stop.bind(stage, input))
    })
  })

  // check the pipeline for invalid definitions
  const invalid = {}
  flows(stages).forEach(flow => {
    const start = flow.shift()
    const end = flow.pop() || start
    if (start.reason === 'DEADEND') {
      invalid[start.name] = 'DEADEND'
    }
    if (end.reason === 'DEADEND') {
      invalid[end.name] = 'DEADEND'
    }
    if (argv['--check']) {
      console.log()
      console.log(start.reason, ':', start.name)
      _.each(flow, stage => {
        console.log('  - %s', stage.name)
      })
      console.log(end.reason, ':', end.name)
    } else if (!_.isEmpty(invalid)) {
      log.error(invalid, 'invalid stages')
      process.exit(EXITS.CONFIG)
    }
  })

  // wait for stages to start before letting stages know that pipeline is ready
  if (!argv['--check']) {
    for (const start of _.filter(_.map(Object.values(stages), 'start'))) {
      try {
        const msg = await start()
        log.info(msg, 'started')
      } catch (err) {
        log.error(err, 'failed to start pipeline')
        process.exit(EXITS.START)
      }
    }
    log.info('pipeline startup complete')
    events.emit('READY')
  }
}

if (require.main === module) {
  main()
}
