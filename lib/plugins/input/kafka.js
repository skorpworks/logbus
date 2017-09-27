'use strict'

// Not sure which client library to use.
if (process.env.KAFKA_LIB === 'librd') {
  module.exports = require('./kafka-librd')
}
else {
  module.exports = require('./kafka-node')
}
