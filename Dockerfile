
FROM node:7-alpine

WORKDIR /src

ADD . /src
RUN npm install -g
RUN npm link

CMD ["logagent", "/conf.yml"]
