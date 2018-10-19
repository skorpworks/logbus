.PHONY: help test test-kafka test-tail coverage docker-build docker-publish rpm-publish
.DEFAULT_GOAL := help

SHELL := /bin/bash

NAME := logbus
VERSION := $(shell jq -r .version package.json)
MAINTAINER := foo@bar.com

DOCKER_REPO := docker.repo
DOCKER_TAG := $(DOCKER_REPO)/$(NAME):$(VERSION)

YUM_SERVER := yum.server
YUM_REPO := /opt/yum

NODE_BIN := $(shell npm bin)


help: ## show target summary
	@grep -E '^\S+:.* ## .+$$' $(MAKEFILE_LIST) | sed 's/##/#/' | while IFS='#' read spec help; do \
	  tgt=$${spec%%:*}; \
	  printf "\n%s: %s\n" "$$tgt" "$$help"; \
	  awk -F ': ' -v TGT="$$tgt" '$$1 == TGT && $$2 ~ "=" { print $$2 }' $(MAKEFILE_LIST) | \
	  while IFS='#' read var help; do \
	    printf "  %s  :%s\n" "$$var" "$$help"; \
	  done \
	done


node_modules: package.json ## install dependencies
	npm install --no-optional
	touch node_modules

start: VERBOSITY=info# log level
start: CONF=config/test.yml# logbus config file
start: node_modules ## start logbus
	./index.js -v $(VERBOSITY) $(CONF) -c


etl: node_modules ## run automated tests
	./index.js -v info examples/elasticsearch-etl/conf.yml | bunyan -o short


test: node_modules ## run automated tests
	@diff -U2 test/dead-ends/out.txt <(./index.js -c test/dead-ends/conf.yml 2>/dev/null)
	@for dir in $$(ls -d test/* | grep -v dead-ends); do \
	  if test -f $$dir/conf.yml; then \
	    echo $$dir; \
	    ./index.js -v warn $$dir/conf.yml | bunyan -o short && diff -U2 $$dir/expected.json <(jq -S --slurp 'from_entries' < $$dir/out.json); \
	  fi; \
	done


coverage: ## record coverage metrics
	$(NODE_BIN)/nyc -n *.js -n lib make test
	$(NODE_BIN)/nyc report --reporter=html


# Not sure how I'd like this automated, so capturing a recipe here for now.
test-kafka: DOCKER=# run logbus in container instead of host
test-kafka: ## test kafka plugins
	@docker rm -f logbus-test-kafka > /dev/null 2> /dev/null || true
	@docker run -d --name logbus-test-kafka -p 2181:2181 -p 9092:9092 -e ADVERTISED_HOST=127.0.0.1 -e ADVERTISED_PORT=9092 spotify/kafka@sha256:cf8f8f760b48a07fb99df24fab8201ec8b647634751e842b67103a25a388981b > /dev/null
	@echo waiting for kafka to start...
	@sleep 5
	@if test -e test/kafka/out.json; then rm test/kafka/out.json; fi
ifdef DOCKER
	make docker-build KAFKA=yeee
	docker run --rm -v $$PWD/test/kafka:/test/kafka --network host $(NAME) -v info /test/kafka/producer.yml | bunyan -o short
	docker run --rm -v $$PWD/test/kafka:/test/kafka --network host $(NAME) -v info /test/kafka/consumer.yml | bunyan -o short
else
	./index.js -v info test/kafka/producer.yml | bunyan -o short
	./index.js -v info test/kafka/consumer.yml | bunyan -o short
endif
	@test 1 == $$(jq '.value.channel | select(. == "odd")' test/kafka/out.json | wc -l)
	@test 2 == $$(jq '.value.channel | select(. == "even")' test/kafka/out.json | wc -l)
	@docker rm -f logbus-test-kafka > /dev/null


# Not sure how I'd like this automated, so capturing a recipe here for now.
test-tail: ## test tail plugin
	./index.js -v debug test/tail/play.yml | bunyan -o short
	jq '.' test/tail/play.db


docker-build: KAFKA=# with kafka support
docker-build: MAXMIND=# with maxmind geo db support
docker-build: Dockerfile ## build docker image
	docker build --build-arg ELASTICSEARCH=$(ELASTICSEARCH) --build-arg KAFKA=$(KAFKA) --build-arg MAXMIND=$(MAXMIND) -t $(NAME) .


docker-publish: ## publish docker image to repo
	docker tag $(NAME) $(DOCKER_TAG)
	docker push $(DOCKER_TAG)


lint: ## check code for errors
	$(NODE_BIN)/eslint lib *.js


RELEASE := $(shell echo $$(( $$(rpm -qp --qf %{RELEASE} rpm 2>/dev/null) + 1)))
rpm: Makefile lib index.js node_modules ## build rpm
	rsync -va package.json pkg/opt/logbus/package.json
	rsync -va --exclude test/ --exclude alasql/utils/ node_modules/ --delete-excluded pkg/opt/logbus/node_modules/
	rsync -va lib/ pkg/opt/logbus/lib/
	rsync -va index.js pkg/opt/logbus/bin/logbus
	cp node_modules/.bin/bunyan pkg/opt/logbus/bin/
	fpm --force --rpm-os linux -s dir -t rpm -C pkg --package rpm --name $(NAME) \
	  --version $(VERSION) --iteration $(RELEASE) \
	  --after-install post-install.sh \
	  --depends nodejs \
	  --vendor custrom --maintainer '<$(MAINTAINER)>' \
	  --rpm-summary 'Log shipper' --url https://github.com/skorpworks/logbus --rpm-changelog CHANGELOG


rpm-publish: rpm ## publish rpm to yum server
	scp rpm $(YUM_SERVER):$(YUM_REPO)/Packages/$(shell rpm -qp --qf %{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}.rpm rpm)
	ssh $(YUM_SERVER) createrepo --update $(YUM_REPO)


shippers/%.rpm: VERSION=0.1# version
shippers/%.rpm: ## build shipper specific rpms
	mkdir -p build/etc/logbus/ build/etc/systemd/system
	rsync -vaL --delete shippers/$*/ build/etc/logbus/
	rsync -va shippers/logbus.service build/etc/systemd/system/logbus.service
	fpm --force --rpm-os linux -s dir -t rpm -C build --package $@ --name logbus-shipper-$* \
	  --version $(VERSION) \
	  --after-install shippers/post-install.sh \
	  --depends logbus \
	  --vendor custom --maintainer '<$(MAINTAINER)>' \
	  --rpm-summary 'Config for $* logbus shipper' --url https://github.com/skorpworks/logbus
