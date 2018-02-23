#!/usr/bin/env bash

set -x

expected_hash="68100e26f9ff69d003750813e72fe0ea7b9e50be-test"
calc="$(node "$rootdir/bin/veendor.js" calc --debug)"

if [[ "$calc" != "$expected_hash" ]]; then
    echo "veendor calc returned unexpected result: $calc"
    echo "expected: $expected_hash"
    exit 1;
fi
