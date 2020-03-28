'use strict'

const doc = `
Emit msg formatted as JSON with \`indent\` (number or string) ending with \`delimiter\`.
`

const defaults = {
  indent: null,
  delimiter: '\n',
}

// TODO: support user-defined replacer()?

module.exports = (config, logbus) => {
  const indent = config.indent === undefined ? defaults.indent : config.indent
  const delimiter = config.delimiter === undefined ? defaults.delimiter : config.delimiter
  const replacer = undefined

  function onInput(event) {
    try {
      logbus.event(JSON.stringify(event, replacer, indent) + delimiter)
    }
    catch (err) {
      logbus.error(err)
    }
  }

  return { doc, defaults, onInput }
}
