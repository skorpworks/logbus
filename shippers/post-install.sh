#!/bin/bash

for i in /etc/logagent/plugins/*/package.json
do
  if test -e "$i"
  then
    pushd $(dirname "$i") >/dev/null
    npm install
    popd >/dev/null
  fi
done

systemctl daemon-reload
systemctl enable logagent.service
systemctl start logagent.service
