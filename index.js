#!/usr/bin/env node

'use strict'

const USAGE = `
Process logs from configured pipeline.

Usage: COMMAND [options] <config>

Options:
  -v, --verbosity LEVEL
    trace, debug, info, warn, error, fatal [default: warn]
  -c, --check
    Validate pipeline
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
  stdout: './lib/plugins/output/stdout'
}

function CLI() {
  var bunyan = require('bunyan')
  var argv = require('docopt').docopt(USAGE)
  var config = require('js-yaml').load(require('fs').readFileSync(argv['<config>'], 'utf8'))
  this.log = bunyan.createLogger({name: process.argv[1].split('/').pop(), level: bunyan[argv['--verbosity'].toUpperCase()]})
  process.setMaxListeners(Infinity)
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
  this.loadPipeline(config.pipeline)
  var invalid = {}
  for (var stages of this.pipelinePaths()) {
    var start = stages.shift()
    var end = stages.pop() || start
    if (start.reason === 'DEADEND') {
      invalid[start.name] = 'DEADEND'
    }
    if (end.reason === 'DEADEND') {
      invalid[end.name] = 'DEADEND'
    }
    if (argv['--check']) {
      console.log()
      console.log(start.reason, ':', start.name)
      for (var stage of stages) {
        console.log('  - %s', stage.name)
      }
      console.log(end.reason, ':', end.name)
    }
  }
  if (!_.isEmpty(invalid)) {
    log.error(invalid, 'invalid stages')
    process.exit(EXITS.CONFIG)
  }
  if (!argv['--check']) {
    this.startPipeline()
  }
}

CLI.prototype.loadPlugins = function(basedir, plugins) {
  for (var name in plugins) {
    MODULES[name] = plugins[name].path
    if (MODULES[name][0] !== '/') {
      MODULES[name] = path.join(basedir, MODULES[name])
    }
  }
}

CLI.prototype.loadPipeline = function(stages) {
  this.stages = {}
  for (let name in stages) {
    var props = stages[name]
    try {
      // TODO: prototype a better fit over a closure?
      this.stages[name] = new Stage(name, props, this.pipeline, this.log.child({stage: name}))
    }
    catch (err) {
      this.log.error(err, 'failed to load stage: %s', name)
    }
  }
  for (let name in this.stages) {
    let stage = this.stages[name]
    for (let input of stage.inputs(this.stages)) {
      this.log.debug(util.format('%s waits on %s', name, input))
      stage.waitOn(input)
      this.pipeline.once(input + '.stopped', stage.stop.bind(stage, input))
    }
  }
}

function Stage(name, stage, pipeline, log) {
  this.log = log
  this.name = name
  this.pipeline = pipeline
  this.module = stage.module || name

  // The logbus api exposed to plugins.
  const logbus = {
    ready: false,
    stage: name,
    log: this.log,
    pipeline: this.pipeline,
    event: this.emitEvent.bind(this),
    error: this.emitError.bind(this),
    stats: this.emitStats.bind(this),
  }
  pipeline.on('READY', (event) => {
    // TODO: share a logbus object
    // this.log.warn('READY?', name)
    logbus.ready = true
  })

  // if (stage.get) {
  //   log.error('reserved config field: get')
  //   process.exit(EXITS.CONFIG)
  // }
  // const plugin = require(MODULES[this.module] || this.module)
  // stage.config.get = field => stage.config[field] === undefined ? plugin.defaults[field] : stage.config[field]
  this.plugin = require(MODULES[this.module] || this.module)(stage.config || {}, logbus)

  this.inChannels = stage.inChannels || []
  this.outChannels = stage.outChannels
  if (this.outChannels === undefined) {
    this.outChannels = this.plugin.outChannels || [name]
  }
  this.statsChannel = stage.statsChannel || 'stats'
  this.errChannel = stage.errChannel || 'errors'
  this.isInput = this.inChannels.length === 0
  this.isOutput = this.outChannels.length === 0
  this.isErrors = this.module === 'errors'
  this.isStats = this.module === 'stats'
  if (this.plugin.onInput) {
    for (var inChannel of this.inChannels) {
      this.pipeline.on(inChannel, this.plugin.onInput) //.bind(this.plugin))
    }
  }
  this.waitingOn = {}
}

Stage.prototype.emitEvent = function(event) {
  if (event) {
    for (var outChannel of this.outChannels) {
      this.pipeline.emit(outChannel, event, this.name)
    }
  }
}

Stage.prototype.emitError = function(err) {
  err.stage = this.name
  this.pipeline.emit(this.errChannel, err)
}

Stage.prototype.emitStats = function(data) {
  data.stage = this.name
  this.pipeline.emit(this.statsChannel, data)
}

Stage.prototype.stop = function(input) {
  var cb = function() {
    this.pipeline.emit(this.name + '.stopped', this.name)
    this.stopped = true
    this.log.debug(this.name, 'stopped')
  }
  delete this.waitingOn[input]
  var waitingOn = Object.keys(this.waitingOn)
  if (waitingOn.length === 0) {
    this.log.info(this.name, 'stopping via', input || 'SHUTDOWN')
    if (this.plugin.stop) {
      this.plugin.stop(cb.bind(this))
    }
    else {
      cb.call(this)
    }
  }
}

Stage.prototype.waitOn = function(stage) {
  this.waitingOn[stage] = true
}

Stage.prototype.inputs = function(stages) {
  var matches = []
  for (var name in stages) {
    if (_.intersection(stages[name].outChannels, this.inChannels).length !== 0) {
      matches.push(name)
    }
  }
  return matches
}

Stage.prototype.outputs = function(stages) {
  var matches = []
  for (var name in stages) {
    if (_.intersection(stages[name].inChannels, this.outChannels).length !== 0) {
      matches.push(name)
    }
  }
  return matches
}

CLI.prototype.pipelinePaths = function() {
  // Scope for closures since bind() on a generator returns a normal function.
  var stages = this.stages
  // Generate all paths that end here.
  var genpaths = function * (name) {
    var stage = stages[name]
    if (stage === undefined) {
      return yield [ {reason: 'UNDEFINED', name: name} ]
    }
    if (stage.isInput) {
      return yield [ {reason: 'INPUT', name: name} ]
    }
    var paths = []
    for (var input of stage.inputs(stages)) {
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
    }
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
  var paths = []
  for (var name in this.stages) {
    var stage = this.stages[name]
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
  }
  return paths
}

CLI.prototype.startPipeline = function() {
  const starters = _.values(this.stages).filter(i => i.plugin.start)
  Promise.resolve(starters.map(stage => stage.plugin.start()))
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
  // TODO: Promises better here?
  this.log.info('shutting down', {reason: reason})
  // Stop all input, error, & stats channels.  Dependent stages should follow.
  for (var name in this.stages) {
    var stage = this.stages[name]
    if (stage.isInput || stage.isErrors || stage.isStats) {
      stage.stop()
    }
  }
  setInterval(this.reportOnShutdown.bind(this), 1000)
  setTimeout(this.terminate.bind(this), 10000)
}

CLI.prototype.reportOnShutdown = function() {
  var shutdown = true
  for (var name in this.stages) {
    var stage = this.stages[name]
    if (!stage.stopped) {
      shutdown = false
      this.log.debug(name, 'waiting on', Object.keys(stage.waitingOn).join(',') || 'SELF')
    }
  }
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
