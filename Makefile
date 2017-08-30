.ONESHELL:
.PHONY: help test docker-build docker-publish rpm-publish
.DEFAULT_GOAL := help

SHELL := /bin/bash

NAME := logagent-js
VERSION := 0.5.14
MAINTAINER := foo@bar.com

DOCKER_REPO := docker.repo/
DOCKER_TAG := $(DOCKER_REPO)logagent

YUM_SERVER := yum.server
YUM_REPO := /opt/yum


help:  ## show target summary
	@grep -E '^\S+:.* ## .+$$' $(MAKEFILE_LIST) | sed 's/##/#/' | while IFS='#' read spec help; do
	  tgt=$${spec%%:*}
	  printf "\n%s: %s\n" "$$tgt" "$$help"
	  awk -F ': ' -v TGT="$$tgt" '$$1 == TGT && $$2 ~ "=" { print $$2 }' $(MAKEFILE_LIST) | \
	  while IFS='#' read var help; do
	    printf "  %s  :%s\n" "$$var" "$$help"
	  done
	done


node_modules: package.json ## install dependencies
	npm install

start: VERBOSITY=info# log level
start: CONF=config/test.yml# logagent config file
start: node_modules ## start logagent
	node bin/logagent.js -v $(VERBOSITY) $(CONF) -c


test: node_modules ## run automated tests
	diff -U2 test/dead-ends/out.txt <(./bin/logagent.js -c test/dead-ends/conf.yml)
	./bin/logagent.js test/skeleton/conf.yml
	diff -U2 test/skeleton/expected.json <(jq -S --slurp 'from_entries' < test/skeleton/out.json)

docker-build: Dockerfile ## build docker image
	docker build -t $(DOCKER_TAG) .


docker-publish: ## publish docker image to repo
	docker push $(DOCKER_TAG)


# pkg/opt/logagent/rootfs: docker-build ## build rootfs
# 	test -d pkg/opt/logagent/rootfs || mkdir -p pkg/opt/logagent/rootfs
# 	cid=$$(docker run -i -d $(DOCKER_TAG) sh)
# 	docker export $$cid | tar x -C pkg/opt/logagent/rootfs
# 	docker rm -f $$cid


RELEASE := $(shell echo $$(( $$(rpm -qp --qf %{RELEASE} rpm 2>/dev/null) + 1)))
rpm: Makefile lib bin node_modules
	rsync -va package.json pkg/opt/logagent/package.json
	rsync -va --exclude test/ --exclude alasql/utils/ node_modules/ --delete-excluded pkg/opt/logagent/node_modules/
	rsync -va lib/ pkg/opt/logagent/lib/
	rsync -va bin/ pkg/opt/logagent/bin/
	cp node_modules/.bin/bunyan pkg/opt/logagent/bin/
	fpm --force --rpm-os linux -s dir -t rpm -C pkg --package rpm --name $(NAME) \
	  --version $(VERSION) --iteration $(RELEASE) \
	  --after-install post-install.sh \
	  --depends nodejs \
	  --vendor custrom --maintainer '<$(MAINTAINER)>' \
	  --rpm-summary 'Log processor' --url https://github.com/skorpworks/logbus --rpm-changelog CHANGELOG


rpm-publish: rpm ## publish rpm to yum server
	scp rpm $(YUM_SERVER):$(YUM_REPO)/Packages/$(shell rpm -qp --qf %{NAME}-%{VERSION}-%{RELEASE}.%{ARCH}.rpm rpm)
	ssh $(YUM_SERVER) createrepo --update $(YUM_REPO)


shippers/%.rpm: VERSION=0.1# version
shippers/%.rpm: ## build host specific rpms
	mkdir -p build/etc/logagent/ build/etc/systemd/system
	rsync -vaL --delete shippers/$*/ build/etc/logagent/
	rsync -va shippers/logagent.service build/etc/systemd/system/logagent.service
	fpm --force --rpm-os linux -s dir -t rpm -C build --package $@ --name logagent-shipper-$* \
	  --version $(VERSION) \
	  --after-install shippers/post-install.sh \
	  --depends logagent-js \
	  --vendor custom --maintainer '<$(MAINTAINER)>' \
	  --rpm-summary 'Config for $* logagent shipper' --url https://github.com/skorpworks/logbus
