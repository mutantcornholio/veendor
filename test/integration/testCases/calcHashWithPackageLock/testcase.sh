#!/usr/bin/env bash

set -x

expected_hash="dea50c9ec128b9868367a5668dea082b906d3116-test"
calc="$(node "$rootdir/bin/veendor.js" calc --debug)"

if [[ "$calc" != "$expected_hash" ]]; then
    echo "veendor calc returned unexpected result: $calc"
    echo "expected: $expected_hash"
    exit 1;
fi
