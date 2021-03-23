
FROM node:14-slim AS build
WORKDIR /app
ADD package.json .
ADD yarn.lock .
RUN yarn --ignore-optional --prod --frozen-lockfile
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

FROM build AS test
RUN yarn install --frozen-lockfile
ADD test .
# fail if needs linting
ADD .eslintrc.yml .
RUN yarn eslint --format unix lib *.js
# fail if any vulnerabilities >= moderate
RUN yarn audit --groups dependencies --level moderate || test $? -le 2
# fail if unit tests fail
RUN yarn jest --coverage --color

FROM build AS prod
COPY --from=test /app /app
WORKDIR /app
CMD ["/app"]

