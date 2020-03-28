.PHONY: help test unittest test-kafka test-tail coverage docker-build docker-publish rpm-publish
.DEFAULT_GOAL := help

SHELL := /bin/bash

NAME := logbus
VERSION := $(shell jq -r .version package.json)
MAINTAINER := foo@bar.com

DOCKER_REPO := docker.repo
DOCKER_TAG := $(DOCKER_REPO)/$(NAME):$(VERSION)

NODE_BIN := $(shell yarn bin)


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
	yarn --no-optional
	touch node_modules


lint: ## check code for errors
	$(NODE_BIN)/eslint --format unix lib *.js


unit-test: ## run unit tests
	yarn jest --coverage --color


example-etl: node_modules ## run etl example
	./index.js -v info examples/elasticsearch-etl/conf.yml | bunyan -o short


e2e-files: node_modules ## run e2e tests of file inputs & outputs
	@diff -U2 test/dead-ends/out.txt <(./index.js -c test/dead-ends/conf.yml 2>/dev/null)
	@for dir in test/pipeline/*; do \
	  pushd $$dir; \
	  ../../../index.js -v warn conf.yml | bunyan -o short && diff -U2 expected.json <(jq -S --slurp 'from_entries' < out.json); \
	  popd; \
	done


# Not sure how I'd like this automated, so capturing a recipe here for now.
e2e-kafka: DOCKER=# run logbus in container instead of host
e2e-kafka: ## run end-to-end tests of kafka inputs & outputs
	@docker rm -f logbus-test-kafka > /dev/null 2> /dev/null || true
	@docker run -d --name logbus-test-kafka -p 2181:2181 -p 9092:9092 -e ADVERTISED_HOST=127.0.0.1 -e ADVERTISED_PORT=9092 spotify/kafka@sha256:cf8f8f760b48a07fb99df24fab8201ec8b647634751e842b67103a25a388981b > /dev/null
	@echo waiting for kafka to start...
	@sleep 5
	@if test -e test/kafka/out.json; then rm test/kafka/out.json; fi
ifdef DOCKER
	make docker-build KAFKA=2.7.4
	docker run --rm -v $$PWD/test/kafka:/test/kafka --network host $(NAME) -v info /test/kafka/producer.yml | bunyan -o short
	docker run --rm -v $$PWD/test/kafka:/test/kafka --network host $(NAME) -v info /test/kafka/consumer.yml | bunyan -o short
else
	./index.js -v info test/kafka/producer.yml | bunyan -o short
	./index.js -v info test/kafka/consumer.yml | bunyan -o short
endif
	test 1 == $$(jq '.value.channel | select(. == "odd")' test/kafka/out.json | wc -l)
	test 2 == $$(jq '.value.channel | select(. == "even")' test/kafka/out.json | wc -l)
	@docker rm -f logbus-test-kafka > /dev/null


# Not sure how I'd like this automated, so capturing a recipe here for now.
e2e-elasticsearch: DOCKER=# run logbus in container instead of host
e2e-elasticsearch: ## run end-to-end tests of elasticsearch inputs & outputs
	docker rm -f logbus-e2e-elasticsearch > /dev/null 2> /dev/null || true
	docker run -d --name logbus-e2e-elasticsearch -p 9200 elasticsearch:6.6.2 > /dev/null
	@echo waiting for elasticsearch to start...
	curl -sS --connect-timeout 60 http://$$(docker port logbus-e2e-elasticsearch 9200) | jq -r '.version.number' | grep -Fq '6.6.2'
ifdef DOCKER
	docker run --rm -v $$PWD/test/elasticsearch:/conf --network host $(NAME) -v info /conf/dynamic-index.yml | bunyan -o short
else
	./index.js -v info test/elasticsearch/dynamic-index.yml | bunyan -o short
endif
	@docker rm -f logbus-e2e-elasticsearch > /dev/null


docker-build: KAFKA=# with kafka support
docker-build: MAXMIND=# with maxmind geo db support
docker-build: Dockerfile ## build docker image
	docker build --build-arg KAFKA=$(KAFKA) --build-arg MAXMIND=$(MAXMIND) -t $(NAME) .


docker-publish: ## publish docker image to repo
	docker tag $(NAME) $(DOCKER_TAG)
	docker push $(DOCKER_TAG)


rpm: RELEASE := $(shell echo $$(( $$(rpm -qp --qf %{RELEASE} rpm 2>/dev/null) + 1)))
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


rpm-publish: YUM_SERVER=yum.server
rpm-publish: YUM_REPO=/opt/yum
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
