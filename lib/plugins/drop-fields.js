'use strict'

// Delete `fields` (array) from events.


module.exports = (config, logbus) => {
  if (config.fields === undefined) {
    throw new Error('undefined config: fields')
  }
  const fields = config.fields

  function onInput(data) {
    try {
      const copy = {}
      for (var field of Object.keys(data)) {
        if (fields.indexOf(field) === -1) {
          copy[field] = data[field]
        }
      }
      logbus.event(copy)
    }
    catch (err) {
      logbus.error(err)
    }
  }

  return { onInput }
}
