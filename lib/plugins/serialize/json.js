
// Emit msg formatted as JSON with `indent` (number or string) ending with `delimiter`.

// TODO: support user-defined replacer()?

module.exports = (config, logbus) => {
  const indent = config.indent == null ? null : config.indent
  const delimiter = config.delimiter == null ? '\n' : config.delimiter
  const replacer = null

  function onInput(event) {
    try {
      logbus.event(JSON.stringify(event, replacer, indent) + delimiter)
    } catch (err) {
      logbus.error(err)
    }
  }

  return {onInput}
}
