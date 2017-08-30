#!/bin/bash

# Assign host's hostname to container's hostname so log msgs show properly
#
# json=$(mktemp --suffix .logagent.json)
# cp /opt/logagent/config.json $json
# jq '.hostname = env.HOSTNAME | .' < $json > /opt/logagent/config.json

if ! test -d /etc/logagent; then
  mkdir /etc/logagent
fi

if ! test -e /etc/logagent/maxmind-city.mmdb; then
  curl http://geolite.maxmind.com/download/geoip/database/GeoLite2-City.mmdb.gz | gzip -d > /etc/logagent/maxmind-city.mmdb
fi

# Let operator manage service
# systemctl restart logagent.service
