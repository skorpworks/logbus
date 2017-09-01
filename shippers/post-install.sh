#!/bin/bash

for i in /etc/logbus/plugins/*/package.json
do
  if test -e "$i"
  then
    pushd $(dirname "$i") >/dev/null
    npm install
    popd >/dev/null
  fi
done

systemctl daemon-reload
systemctl enable logbus.service
systemctl start logbus.service
