
FROM node:10-slim

WORKDIR /opt/logbus

# Add node modules in a way that will allow Docker to cache them.
ADD package.json .
RUN yarn --ignore-optional --prod
ADD lib lib
ADD stage.js .
ADD index.js .

ARG KAFKA
RUN if test -n "${KAFKA}"; then \
  apt-get update && apt-get -y install build-essential python-dev && rm -rf /var/lib/apt/lists/*; \
  yarn add --no-lockfile node-rdkafka@${KAFKA}; \
  fi

ARG ALASQL
RUN if test -n "${ALASQL}"; then yarn add --no-lockfile alasql@${ALASQL}; fi

ARG MAXMIND
RUN if test -n "${MAXMIND}"; then yarn add --no-lockfile maxmind-db-reader@${MAXMIND}; fi

# The `bin` in package.json doesn't work since node_modules in .dockerignore
#
#   npm ERR! enoent ENOENT: no such file or directory, chmod '/usr/local/lib/node_modules/logbus/index.js'
#
RUN ln -s /opt/logbus/index.js /usr/bin/logbus

ENTRYPOINT ["logbus"]
