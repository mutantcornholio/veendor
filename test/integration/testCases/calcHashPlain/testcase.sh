#!/usr/bin/env bash

set -x

expected_hash="1f15a972350cb78a37010a59330802b6fff35433-test"
calc="$(node "$rootdir/bin/veendor.js" calc --debug)"

if [[ "$calc" != "$expected_hash" ]]; then
    echo "veendor calc returned unexpected result: $calc"
    echo "expected: $expected_hash"
    exit 1;
fi
