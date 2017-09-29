
FROM node:6-alpine

# Add node modules in a way that will allow Docker to cache them.
ADD package.json /opt/logbus/package.json
RUN cd /opt/logbus && npm install -g

ARG KAFKA
RUN if test -n "${KAFKA}"; then \
      apk add --update alpine-sdk python-dev bash && \
      WITH_SASL=0 npm install kafka-node@2.2.3 node-rdkafka@2.0.0; \
    fi

ARG ELASTICSEARCH
RUN if test -n "${ELASTICSEARCH}"; then npm install elasticsearch@13.0.1; fi

ARG ALASQL
RUN if test -n "${ALASQL}"; then npm install alasql@0.3.3; fi

ARG MAXMIND
RUN if test -n "${MAXMIND}"; then npm install maxmind-db-reader@0.2.1; fi

ADD . /opt/logbus

WORKDIR /opt/logbus

# The `bin` in package.json doesn't work since node_modules in .dockerignore
#
#   npm ERR! enoent ENOENT: no such file or directory, chmod '/usr/local/lib/node_modules/logbus/index.js'
#
RUN ln -s /usr/local/lib/node_modules/logbus/index.js /usr/bin/logbus

CMD ["logbus"]
