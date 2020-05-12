#!/usr/bin/env node

'use strict'

// TODO: Look into https://github.com/blend/promise-utils#readme as replacement for bluebird

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

// Exit non-success on unhandled exception, particularly useful so supervisors
// can restart the service when configured to do so.
// TODO: should attempt a clean shutdown first
process.on('uncaughtException', function (err) {
  console.error(err)
  process.exit(EXITS.EXCEPTION)
})

const EventEmitter = require('eventemitter3')
const Promise = require('bluebird')
const util = require('util')
const path = require('path')
const _ = require('lodash')
const yaml = require('js-yaml')
const fs = require('fs')

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

const TEMPLATES = {}

function CLI() {
  const bunyan = require('bunyan')
  const argv = require('docopt').docopt(USAGE)
  const config = yaml.load(fs.readFileSync(argv['<config>'], 'utf8'))
  this.log = bunyan.createLogger({name: process.argv[1].split('/').pop(), level: bunyan[argv['--verbosity'].toUpperCase()]})
  process.setMaxListeners(Infinity)
  // TODO: overloading the use of "pipeline" is confusing
  this.pipeline = new EventEmitter()
  // Stages will use `SIGTERM` event to signal pipeline to shut down.
  this.pipeline.on('SIGTERM', this.shutdown.bind(this))
  // process.on('exit', this.shutdown.bind(this, 'EXIT'))
  process.once('SIGINT', this.shutdown.bind(this, 'SIGINT'))
  process.once('SIGQUIT', this.shutdown.bind(this, 'SIGQUIT'))
  process.once('SIGTERM', this.shutdown.bind(this, 'SIGTERM'))
  if (config.plugins) {
    this.loadPlugins(path.resolve(path.dirname(argv['<config>'])), config.plugins)
  }
  if (config.templates) {
    this.loadTemplates(path.resolve(path.dirname(argv['<config>'])), config.templates)
  }
  this.loadPipeline(config.pipeline)
  const invalid = {}
  this.pipelinePaths().forEach((stages) => {
    const start = stages.shift()
    const end = stages.pop() || start
    if (start.reason === 'DEADEND') {
      invalid[start.name] = 'DEADEND'
    }
    if (end.reason === 'DEADEND') {
      invalid[end.name] = 'DEADEND'
    }
    if (argv['--check']) {
      console.log()
      console.log(start.reason, ':', start.name)
      _.each(stages, (stage, name) => {
        console.log('  - %s', stage.name)
      })
      console.log(end.reason, ':', end.name)
    }
    else if (!_.isEmpty(invalid)) {
      this.log.error(invalid, 'invalid stages')
      process.exit(EXITS.CONFIG)
    }
  })
  if (!argv['--check']) {
    this.startPipeline()
  }
  this.shutdownTimeout = parseFloat(argv['--timeout']) * 1000
}

CLI.prototype.loadPlugins = function(basedir, plugins) {
  _.each(plugins, (props, name) => {
    MODULES[name] = props.path
    if (MODULES[name][0] !== '/') {
      MODULES[name] = path.join(basedir, MODULES[name])
    }
  })
}

CLI.prototype.loadTemplates = function(basedir, templates) {
  _.each(templates, (props, name) => {
    if (props.path[0] !== '/') {
      props.path = path.join(basedir, props.path)
    }
    TEMPLATES[name] = yaml.load(fs.readFileSync(props.path, 'utf8'))
  })
}

CLI.prototype.loadPipeline = function(stages) {
  this.stages = {}
  _.each(stages, (stage, name) => {
    if (stage.template) {
      const [ns, template] = stage.template.split('.')
      if (!TEMPLATES[ns]) {
        throw new Error(`undefined stage template: ${stage.template}`)
      }
      stage = _.merge({}, TEMPLATES[ns][template], stage)
    }
    if (!stage.module) {
      stage.module = name
    }
    const pipeline = this.pipeline
    try {
      // The logbus api exposed to plugins.
      const logbus = {
        ready: false,
        stage: name,
        log: this.log.child({stage: name}),
        pipeline: this.pipeline,
      }
      const plugin = require(MODULES[stage.module] || stage.module)(stage.config || {}, logbus)
      // TODO: This sucks - all kinds of odd coupling twix stage, plugin, and logbus instance
      stage.outChannels = stage.outChannels || plugin.outChannels || [name]
      logbus.event = (event) => {
        if (event) {
          stage.outChannels.forEach(chan => pipeline.emit(chan, event, name))
        }
      }
      logbus.stats = (data) => {
        data.stage = name
        pipeline.emit(stage.statsChannel || 'stats', data)
      }
      logbus.error = (err) => {
        err.stage = name
        pipeline.emit(stage.errChannel || 'errors', err)
      }
      this.stages[name] = require('./stage')(name, stage, plugin, logbus)
    }
    catch (err) {
      this.log.error(err, 'failed to load stage: %s', name)
    }
  })
  _.each(this.stages, (stage, name) => {
    stage.inputs(this.stages).forEach((input) => {
      this.log.debug(util.format('%s waits on %s', name, input))
      stage.waitOn(input)
      this.pipeline.once(input + '.stopped', stage.stop.bind(stage, input))
    })
  })
}

CLI.prototype.pipelinePaths = function() {
  // Scope for closures since bind() on a generator returns a normal function.
  const stages = this.stages
  // Generate all paths that end here.
  const genpaths = function * (name) {
    const stage = stages[name]
    if (stage === undefined) {
      return yield [ {reason: 'UNDEFINED', name: name} ]
    }
    if (stage.isInput) {
      return yield [ {reason: 'INPUT', name: name} ]
    }
    const paths = []
    stage.inputs(stages).forEach((input) => {
      // TODO: Detect loops
      let i
      const pathiter = genpaths(input)
      while (true) {
        i = pathiter.next()
        if (i.done) {
          break
        }
        paths.push(i.value.concat([{name: name}]))
      }
    })
    if (paths.length === 0) {
      if (stage.isErrors) {
        return yield [ {reason: 'ERRORS', name: name} ]
      }
      else if (stage.isStats) {
        return yield [ {reason: 'STATS', name: name} ]
      }
      else {
        return yield [ {reason: 'DEADEND', name: name} ]
      }
    }
    yield * paths
  }
  const paths = []
  _.each(this.stages, (stage, name) => {
    if (stage.outputs(stages).length === 0) {
      // Start at stages with no outputs and work our way back.
      let i
      const pathiter = genpaths(name)
      while (true) {
        i = pathiter.next()
        if (i.done) {
          break
        }
        if (stage.isOutput) {
          i.value[i.value.length - 1].reason = 'OUTPUT'
        }
        else {
          i.value[i.value.length - 1].reason = 'DEADEND'
        }
        paths.push(i.value)
      }
    }
  })
  return paths
}

CLI.prototype.startPipeline = function() {
  const starters = _.values(this.stages).map(i => i.start)
  Promise.resolve(starters.map(i => i()))
    .each((msg) => {
      this.log.info(msg, 'started')
    })
    .then(() => {
      this.log.info('pipeline startup complete')
      this.pipeline.emit('READY')
    })
    .catch((err) => {
      this.log.error(`failed to start pipeline: ${err}`)
      process.exit(EXITS.START)
    })
}

CLI.prototype.shutdown = function(reason) {
  // TODO: Put "wait for startup" logic here so plugins need not worry about it.
  this.log.info('shutting down', {reason: reason})
  // Stop all input, error, & stats channels.  Dependent stages should follow.
  // TODO: Promises Promises!
  _.each(this.stages, (stage, name) => {
    if (stage.isInput || stage.isErrors || stage.isStats) {
      stage.stop()
    }
  })
  // TODO: Stop stages, then stats, then errors
  setInterval(this.reportOnShutdown.bind(this), 1000)
  setTimeout(this.terminate.bind(this), this.shutdownTimeout)
}

CLI.prototype.reportOnShutdown = function() {
  let shutdown = true
  _.each(this.stages, (stage, name) => {
    if (!stage.stopped()) {
      shutdown = false
      this.log.info(name, 'waiting on', Object.keys(stage.waitingOn).join(',') || 'SELF')
    }
  })
  if (shutdown) {
    this.log.info('all stages shut down cleanly')
    process.exit(EXITS.SUCCESS)
  }
}

CLI.prototype.terminate = function() {
  this.log.error('timed out waiting for pipeline to shut down')
  process.exit(EXITS.TIMEOUT)
}

if (require.main === module) {
  const logbus = new CLI() // eslint-disable-line no-unused-vars
}
else {
  module.exports = CLI
}
