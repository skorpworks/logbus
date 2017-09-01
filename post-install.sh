#!/bin/bash

# Assign host's hostname to container's hostname so log msgs show properly
#
# json=$(mktemp --suffix .logbus.json)
# cp /opt/logbus/config.json $json
# jq '.hostname = env.HOSTNAME | .' < $json > /opt/logbus/config.json

if ! test -d /etc/logbus; then
  mkdir /etc/logbus
fi

if ! test -e /etc/logbus/maxmind-city.mmdb; then
  curl http://geolite.maxmind.com/download/geoip/database/GeoLite2-City.mmdb.gz | gzip -d > /etc/logbus/maxmind-city.mmdb
fi

# Let operator manage service
# systemctl restart logbus.service
