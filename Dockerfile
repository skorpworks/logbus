
FROM node:16-slim AS build
WORKDIR /app
ADD package.json .
ADD yarn.lock .
RUN yarn --ignore-optional --prod --frozen-lockfile
ADD lib lib
ADD stage.js .
ADD index.js .

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
ENV NODE_ENV production
CMD ["index.js"]
