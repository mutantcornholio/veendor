#!/usr/bin/env bash

set -x

expected_hash="83e0f500934b0f43f73cf05f3ef3e9d78228a70d-test"
calc="$(node "$rootdir/bin/veendor.js" calc --debug)"

if [[ "$calc" != "$expected_hash" ]]; then
    echo "veendor calc returned unexpected result: $calc"
    echo "expected: $expected_hash"
    exit 1;
fi
