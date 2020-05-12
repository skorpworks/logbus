
# LogBus

Some interesting features compared to other log shippers:

## First-class Support for User-defined Pipelines

Pipelines are composed of stages, where a stage is composed of a plugin (aka
module), input channels, output channels, and module specific configuration.

## First-class Support for Adhoc Code

The `js` plugin allows users to quickly & simply sprinkle custom javascript code
as a stage without having to bother developing a plugin. This is useful for
simple things like filtering, enriching, and normalizing events.

## Ability to Split the Event Stream

Stages can subscribe to multiple input channels, allowing the event stream to
split & join however needed. This is useful to sprinkle in conditional logic in
a more composable way. Otherwise, users would be required to either:

- Run multiple logbus instances. This approach can be prohibitively expensive,
  particularly at the ingest portion of the pipeline (eg reading files, kafka
  topics, elasticsearch indices).

- Modify existing plugins or create new ones, which can be unnecessarily
  complex, more prone to error, and less maintainable.

Some examples of how this can be useful:

### Debugging

Can easily tap into the pipeline with debug logic with little risk to impacting
the production flow. This debug sub-pipeline can be as simple or complex as
needed:

- Only want to log a sample of the events? Add a `sample` stage.
- Only want to debug specific kinds of events? Add a `js` stage that filters
  accordingly.
- Want the debugged events to go to a different destination? Add another output
  stage to ship those elsewhere.

### Roll-ups / Aggregations

One way to deal with noisy processes or processes that log in shipper-unfriendly
ways (eg multi-line tracebacks) is to aggegate those events into a single event.
Allowing the event stream to be split into different roll-up logic and then
re-joined for the common enriching & output stages can be useful.


# Usage

Refer to ./config/example.yml for this section. The logbus executable takes a
config file as input. The config file defines the processing pipeline.

Pipelines can be checked with the `--check` CLI flag to print the pipeline in a
more human-friendly format.  Any loops or dead-ends will be detected.

## Stage Names

A stage can be named using any acceptable YAML key. There are two reserved stage
names, however: `errors` & `stats`. See "Error Handling" & "Performance
Monitoring" below for more details.

## Custom Plugins

There is support for custom plugins. Simply give it a name and a path to the
javascript file - relative paths will be resolved relative to the config file's
directory. Refer to ./lib/plugins/pass.js as a skeleton for creating plugins.
Custom plugins need to manage their own dependencies (eg `npm install ...`).

## Stage Templates

Definitions for commonly used stages (eg read journald, log errors) can be
factored out into templates and then included in a pipeline's stage, adding &
overriding fields as needed.

## Error Handling

`errors` is one of two inherent channels that events will be emitted to.
Anything reported via `logbus.error(err)` will be emitted to the `errors`
channel where they can be handled just like any other event (eg filtered, logged
to console, written to a file).

## Performance Monitoring

`stats` is one of two inherent channels that performance metrics will be emitted
to. Any supported fields reported via `logbus.stats({...})` will be accumulated
then emitted to the `stats` channel where they can be handled just like any
other event.  Supported metrics that a plugin may report:

- `errors`
- `events_in` & `events_out`
- `bytes_in` & `bytes_out`
- `lines_in` & `lines_out`

## Mutation

Assume a pipeline stage will mutate given events. Up to the pipeline to copy as
needed since: a) more performant and b) rare to have pipelines with multiple
stages reading from the same upstream stage.

## Avoiding Out-of-Memory (OOM) Errors

Memory usage depends primarily on the pipeline definition. One data point as of
mid 2020: processing the journal of a host machine emitting 100 events per
second resulted in heaps under 50MB and resident memory under 100MB - pipeline
made heavy use of aggregations. Can override the nodejs default via environment
variable like so:

    NODE_OPTIONS='--max_old_space_size=4096'

# Dev

See `make help` for list of helpful targets.

## Plugin Interface

- `onInput(event)`: the "main" hook for a plugin. `event` is the object emitted
  by the subscribed stages. It is up to the user (the one configuring the
  pipeline) to wire them up correctly. All plugins except for input plugins
  should define this.

- `async start()`: a hook for any prep work before event processing should begin.
  Typically needed for input plugins. If plugin needs to set up any timers, this
  is the place.

- `async stop()`: a hook for any cleanup work before processing stops. Examples
  when this might be needed: flush any buffered state, close connections or files.

## Unit Testing

`make unit-test` will test plugins. Plugins should have their spec files
colocated beside them. Plugins should strive to be simple functions, but here
are some ways they are not:

- If a plugin needs to manage state, then that can persist in its closure and
managed however the plugin sees fit. For example, the elasticsearch output
plugin batches events into an array until it is ready to perform a bulk insert.

- The return value of `onInput()` is only used by the unit-testing helper so
  that the spec can inspect the results.

- Some plugins may require special start & stop handling.

## Pipeline Testing

`make e2e-files` will test more real-world like scenarios and exercise the main
engine bits, but limited to simpler inputs & outputs (files) - see
./test/pipeline for examples.

## End-to-End Testing

There is no decent automated testing of pipelines against more interesting
inputs & outputs - see `make e2e-kafka` & `make e2e-elasticsearch` for ideas.


# Known Issues, Limitations, Warts

- Would be nice to have a mechanism to communicate back pressure so that inputs
  can back off accordingly.

- There should be an example demonstrating how to "commit" events. For example,
  when consuming from a kafka topic, should only commit offsets once the final
  pipeline stage has confirmed that the event was received successfully.

- The clunky use of callbacks in the "wait for stages to shutdown" should be
  replaced with async/await and/or Promises.

- There is some clunky use of javascript prototypes ("classes") where closures
  are preferred for handling state (see plugin implementations for example).

- Would be nice if plugins could communicate the type (and maybe shape as well)
  of the events they process. Then, a user could be warned if a pipeline
  configuration contains stages wired up errornesouly.
