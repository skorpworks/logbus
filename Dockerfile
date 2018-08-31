
FROM node:8-alpine

WORKDIR /opt/logbus

ARG KAFKA
RUN if test -n "${KAFKA}"; then \
    apk add --update alpine-sdk python-dev zlib-dev bash && \
    npm install node-rdkafka@2.4.1; \
    fi

ARG ALASQL
RUN if test -n "${ALASQL}"; then npm install alasql@0.3.3; fi

ARG MAXMIND
RUN if test -n "${MAXMIND}"; then npm install maxmind-db-reader@0.2.1; fi

# Add node modules in a way that will allow Docker to cache them.
ADD . .
RUN npm install --no-optional --only=prod

# The `bin` in package.json doesn't work since node_modules in .dockerignore
#
#   npm ERR! enoent ENOENT: no such file or directory, chmod '/usr/local/lib/node_modules/logbus/index.js'
#
RUN ln -s /opt/logbus/index.js /usr/bin/logbus

ENTRYPOINT ["logbus"]
