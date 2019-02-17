
FROM node:8-slim

WORKDIR /opt/logbus

# Need git for my superagent.
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

ARG KAFKA
RUN if test -n "${KAFKA}"; then \
  apt-get update && apt-get install -y build-essential python-dev && rm -rf /var/lib/apt/lists/* && \
  npm install node-rdkafka@${KAFKA}; \
  fi

ARG ALASQL
RUN if test -n "${ALASQL}"; then npm install alasql@${ALASQL}; fi

ARG MAXMIND
RUN if test -n "${MAXMIND}"; then npm install maxmind-db-reader@${MAXMIND}; fi

# Add node modules in a way that will allow Docker to cache them.
ADD package.json .
ADD package-lock.json .
RUN npm install --no-optional --only=prod
ADD lib lib
ADD stage.js .
ADD index.js .

# The `bin` in package.json doesn't work since node_modules in .dockerignore
#
#   npm ERR! enoent ENOENT: no such file or directory, chmod '/usr/local/lib/node_modules/logbus/index.js'
#
RUN ln -s /opt/logbus/index.js /usr/bin/logbus

ENTRYPOINT ["logbus"]
#    apk add --update alpine-sdk python-dev zlib-dev bash && \
