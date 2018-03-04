#!/usr/bin/env bash

set -x

expected_hash="20c8a8f7a22105800b01d8d0cb6a3d169df0fcad-test"
calc="$(node "$rootdir/bin/veendor.js" calc --debug)"

if [[ "$calc" != "$expected_hash" ]]; then
    echo "veendor calc returned unexpected result: $calc"
    echo "expected: $expected_hash"
    exit 1;
fi
