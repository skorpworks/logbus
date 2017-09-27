#!/bin/sh
':' // ; exec "$(command -v node || command -v nodejs)" --harmony "${NODE_OPTIONS:---max-old-space-size=1024}" "$0" "$@"
'use strict'

var USAGE = `
Process logs from configured pipeline.

Usage: COMMAND [options] <config>

Options:
  -v, --verbosity LEVEL
    trace, debug, info, warn, error, fatal [default: warn]
  -c, --check
    Validate pipeline
`

// Exit non-success on unhandled exception, particularly useful so supervisors
// can restart the service when configured to do so.
process.on('uncaughtException', function (err) {
  console.error(err)
  process.exit(42)
})

const EventEmitter = require('eventemitter3')
const util = require('util')
const lodash = require('lodash')
const path = require('path')

var MODULES = {
  'file-in': '../lib/plugins/input/file',
  'file-out': '../lib/plugins/output/file',
  'json-in': '../lib/plugins/input/json',
  'json-out': '../lib/plugins/output/json',
  'tcp-in': '../lib/plugins/input/tcp',
  journal: '../lib/plugins/input/journal',
  tail: '../lib/plugins/input/tail',
  'yaml-in': '../lib/plugins/input/yaml',
  'yaml-out': '../lib/plugins/output/yaml',
  agg: '../lib/plugins/agg',
  cast: '../lib/plugins/cast',
  drop: '../lib/plugins/drop-fields',
  // 'elasticsearch-in': '../lib/plugins/input/elasticsearch',
  'elasticsearch-log': '../lib/plugins/elasticsearch',
  'elasticsearch-out': '../lib/plugins/output/elasticsearch',
  elasticsearch: '../lib/plugins/output/elasticsearch', // DEPRECATED
  'kafka-in': '../lib/plugins/input/kafka',
  'kafka-out': '../lib/plugins/output/kafka',
  errors: '../lib/plugins/errors',
  gc: '../lib/plugins/gc',
  geoip: '../lib/plugins/geoip',
  geopop: '../lib/plugins/geopop',
  js: '../lib/plugins/js',
  keep: '../lib/plugins/keep-fields',
  lines: '../lib/plugins/input/lines',
  log: '../lib/plugins/log',
  pass: '../lib/plugins/pass',
  rename: '../lib/plugins/rename-fields',
  sample: '../lib/plugins/sample',
  sql: '../lib/plugins/sql',
  stats: '../lib/plugins/stats',
  stdin: '../lib/plugins/input/stdin',
  stdout: '../lib/plugins/output/stdout'
}

function CLI() {
  var bunyan = require('bunyan')
  var argv = require('docopt').docopt(USAGE)
  var config = require('js-yaml').load(require('fs').readFileSync(argv['<config>'], 'utf8'));
  this.log = bunyan.createLogger({name: process.argv[1].split('/').pop(), level: bunyan[argv['--verbosity'].toUpperCase()]})
  process.setMaxListeners(Infinity)
  this.pipeline = new EventEmitter()
  // Stages will use `SIGTERM` event to signal pipeline to shut down.
  this.pipeline.on('SIGTERM', this.shutdown.bind(this))
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
  if (Object.keys(invalid).length > 0) {
    throw new Error('invalid stages: ' + JSON.stringify(invalid, null, 2))
  }
  if (! argv['--check']) {
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
  for (var name in stages) {
    var props = stages[name]
    try {
      this.stages[name] = new Stage(name, props, this.pipeline, this.log.child({stage: name}))
    }
    catch (err) {
      this.log.error(err, 'failed to load stage: %s', name)
    }
  }
  for (var name in this.stages) {
    var stage = this.stages[name]
    for (var input of stage.inputs(this.stages)) {
      this.log.debug(util.format('%s waits on %s', name, input))
      stage.waitOn(input)
      this.pipeline.once(input + '.stopped', stage.stop.bind(stage, input))
    }
  }
}

var Stage = function(name, stage, pipeline, log) {
  this.log = log
  this.name = name
  this.pipeline = pipeline
  this.module = stage.module || name
  var Plugin = require(MODULES[this.module] || this.module)
  this.plugin = new Plugin(stage.config || {})
  this.plugin.log = this.log
  this.plugin.pipeline = this.pipeline
  this.plugin.emitEvent = this.emitEvent.bind(this)
  this.plugin.emitError = this.emitError.bind(this)
  this.plugin.emitStats = this.emitStats.bind(this)
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
      this.pipeline.on(inChannel, this.plugin.onInput.bind(this.plugin))
    }
  }
  this.waitingOn = {}
}

Stage.prototype.emitEvent = function(event) {
  if (event) {
    for (var outChannel of this.outChannels) {
      this.pipeline.emit(outChannel, event)
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
    if (lodash.intersection(stages[name].outChannels, this.inChannels).length !== 0) {
      matches.push(name)
    }
  }
  return matches
}

Stage.prototype.outputs = function(stages) {
  var matches = []
  for (var name in stages) {
    if (lodash.intersection(stages[name].inChannels, this.outChannels).length !== 0) {
      matches.push(name)
    }
  }
  return matches
}

CLI.prototype.pipelinePaths = function() {
  // Scope for closures since bind() on a generator returns a normal function.
  var stages = this.stages
  // Generate all paths that end here.
  var genpaths = function*(name) {
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
      var i, pathiter = genpaths(input)
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
    yield* paths
  }
  var paths = []
  for (var name in this.stages) {
    var stage = this.stages[name]
    if (stage.outputs(stages).length === 0) {
      // Start at stages with no outputs and work our way back.
      var i, pathiter = genpaths(name)
      while (true) {
        i = pathiter.next()
        if (i.done) {
          break
        }
        if (stage.isOutput) {
          i.value[i.value.length-1].reason = 'OUTPUT'
        }
        else {
          i.value[i.value.length-1].reason = 'DEADEND'
        }
        paths.push(i.value)
      }
    }
  }
  return paths
}

CLI.prototype.startPipeline = function() {
  for (var name in this.stages) {
    try {
      var stage = this.stages[name]
      if (stage.plugin.start) {
        stage.log.info(name, 'starting')
        stage.plugin.start()
      }
    }
    catch (err) {
      stage.log.error(err, 'failed to start')
    }
  }
}

CLI.prototype.shutdown = function(reason) {
  this.log.info({reason: reason}, 'shutting down')
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
    process.exit(0)
  }
}

CLI.prototype.terminate = function() {
  this.log.error('timed out waiting for pipeline to shut down') 
  process.exit(2)
}

if (require.main === module) {
  var logbus = new CLI()
}
else {
  module.exports = CLI
}
