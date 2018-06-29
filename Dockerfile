
FROM node:8-alpine

ARG KAFKA
RUN if test -n "${KAFKA}"; then \
      apk add --update git alpine-sdk python-dev zlib-dev bash && \
      cd /opt && git clone -b v2.3.1 --recursive https://github.com/Blizzard/node-rdkafka.git; \
    fi
RUN if test -n "${KAFKA}"; then \
      cd /opt/node-rdkafka && sed -i'' -E -e "s#-l(crypto|ssl)#-lz#g" deps/librdkafka.gyp && npm install -g --unsafe; \
    fi

ARG ELASTICSEARCH
RUN if test -n "${ELASTICSEARCH}"; then npm install -g elasticsearch@13.0.1; fi

ARG ALASQL
RUN if test -n "${ALASQL}"; then npm install -g alasql@0.3.3; fi

ARG MAXMIND
RUN if test -n "${MAXMIND}"; then npm install -g maxmind-db-reader@0.2.1; fi

# Add node modules in a way that will allow Docker to cache them.
ADD package.json /opt/logbus/package.json
ADD . /opt/logbus
RUN cd /opt/logbus && npm install -g --no-optional --only=prod

# The `bin` in package.json doesn't work since node_modules in .dockerignore
#
#   npm ERR! enoent ENOENT: no such file or directory, chmod '/usr/local/lib/node_modules/logbus/index.js'
#
RUN ln -s /usr/local/lib/node_modules/logbus/index.js /usr/bin/logbus

CMD ["bash"]
