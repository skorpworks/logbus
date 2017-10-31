'use strict'

// Not sure which client library to use.
if (process.env.KAFKA_LIB === 'node') {
  module.exports = require('./kafka-node')
}
else {
  module.exports = require('./kafka-librd')
}
