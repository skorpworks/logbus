
// Emit JSON strings as javascript objects.

module.exports = (config, logbus) => {
  function onInput(event) {
    try {
      logbus.event(JSON.parse(event))
    } catch (err) {
      logbus.error(err)
    }
  }

  return {onInput}
}
