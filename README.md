
# LogBus

A log shipper forked from sematext's logagent-js that supports user-defined pipelines.


## Usage

Refer to ./config/example.yml for this section.

The logbus.js executable takes a config file as input. The config file defines
the processing pipeline. A pipeline is a series of stages. A stage contains a
plugin (the code to process the event), input channels, output channels, and
plugin specific config. 

There is support for custom plugins. Simply give it a name and a path to the
javascript file - relative paths will be resolved relative to the config file's
directory. Refer to ./lib/plugins/pass.js as a skeleton for creating plugins.
Custom plugins need to manage their own dependencies (eg `npm install ...`).

### Setting Max Heap to Avoid Out-of-Memory (OOM) Errors

Can override the default via environment variable like so:

    NODE_OPTIONS='--max_old_space_size=4096'

## Dev

See `make help` for list of helpful targets.


### Testing

There are no unit tests yet, only integration tests. Integration tests operate
against a test payload & config. The config will write results to a file for
comparison against expected results.


### TODO

- Get superagent changes merged upstream or publish to npm so don't have to
  install git.

- Get ahead of Elasticsearch Common Schema (ECS):
  https://github.com/elastic/ecs
