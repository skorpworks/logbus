
FROM node:6

ARG KAFKA
RUN if test -n "${KAFKA}"; then \
      apt-get update && \
      apt-get install -y build-essential python-dev bash && \
      apt-get autoremove -y && \
      apt-get clean -y && \
      rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*; \
      # apk add --update git alpine-sdk python-dev bash && \
      # mkdir -p /opt && cd /opt && \
      # git clone -b v2.1.1 --recursive https://github.com/Blizzard/node-rdkafka.git; \
    fi
RUN if test -n "${KAFKA}"; then \
      npm install -g --unsafe node-rdkafka@2.1.1; \
      # Trying to disable ssl, sasl, lz4 until I figure out how to do it more properly.  Doesn't work :(
      #
      # apk add --update lz4-dev openssl-dev && \
      # cd /opt/node-rdkafka && \
      # sed -i'' -e 's#./configure#./configure --enable-ssl --disable-sasl#' util/configure.js && \
      # # sed -i'' -e "s#, '-lcrypto'##" deps/librdkafka.gyp && \
      # npm install -g --unsafe; \
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
RUN cd /opt/logbus && npm install -g --no-optional

# The `bin` in package.json doesn't work since node_modules in .dockerignore
#
#   npm ERR! enoent ENOENT: no such file or directory, chmod '/usr/local/lib/node_modules/logbus/index.js'
#
RUN ln -s /usr/local/lib/node_modules/logbus/index.js /usr/bin/logbus

CMD ["bash"]
