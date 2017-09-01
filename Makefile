.ONESHELL:
.PHONY: help test docker-build docker-publish rpm-publish
.DEFAULT_GOAL := help

SHELL := /bin/bash

NAME := logbus
VERSION := 0.5.14
MAINTAINER := foo@bar.com

DOCKER_REPO := docker.repo/
DOCKER_TAG := $(DOCKER_REPO)logbus

YUM_SERVER := yum.server
YUM_REPO := /opt/yum


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
	npm install

start: VERBOSITY=info# log level
start: CONF=config/test.yml# lobgus config file
start: node_modules ## start lobgus
	node bin/lobgus.js -v $(VERBOSITY) $(CONF) -c


test: node_modules ## run automated tests
	diff -U2 test/dead-ends/out.txt <(./bin/lobgus.js -c test/dead-ends/conf.yml)
	for dir in $$(ls -d test/* | grep -v dead-ends); do \
	  test -f $$dir/conf.yml && echo $$dir && ./bin/lobgus.js $$dir/conf.yml && diff -U2 $$dir/expected.json <(jq -S --slurp 'from_entries' < $$dir/out.json); \
	done

docker-build: Dockerfile ## build docker image
	docker build -t $(DOCKER_TAG) .


docker-publish: ## publish docker image to repo
	docker push $(DOCKER_TAG)


# Experiment with other container runtimes:
#
# pkg/opt/lobgus/rootfs: docker-build ## build rootfs
# 	test -d pkg/opt/lobgus/rootfs || mkdir -p pkg/opt/lobgus/rootfs
# 	cid=$$(docker run -i -d $(DOCKER_TAG) sh)
# 	docker export $$cid | tar x -C pkg/opt/lobgus/rootfs
# 	docker rm -f $$cid


RELEASE := $(shell echo $$(( $$(rpm -qp --qf %{RELEASE} rpm 2>/dev/null) + 1)))
rpm: Makefile lib bin node_modules ## build rpm
	rsync -va package.json pkg/opt/lobgus/package.json
	rsync -va --exclude test/ --exclude alasql/utils/ node_modules/ --delete-excluded pkg/opt/lobgus/node_modules/
	rsync -va lib/ pkg/opt/lobgus/lib/
	rsync -va bin/ pkg/opt/lobgus/bin/
	cp node_modules/.bin/bunyan pkg/opt/lobgus/bin/
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
	mkdir -p build/etc/lobgus/ build/etc/systemd/system
	rsync -vaL --delete shippers/$*/ build/etc/lobgus/
	rsync -va shippers/lobgus.service build/etc/systemd/system/lobgus.service
	fpm --force --rpm-os linux -s dir -t rpm -C build --package $@ --name lobgus-shipper-$* \
	  --version $(VERSION) \
	  --after-install shippers/post-install.sh \
	  --depends lobgus \
	  --vendor custom --maintainer '<$(MAINTAINER)>' \
	  --rpm-summary 'Config for $* logbus shipper' --url https://github.com/skorpworks/logbus
