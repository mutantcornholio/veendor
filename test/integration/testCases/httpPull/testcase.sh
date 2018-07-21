#!/usr/bin/env bash

mkdir "$(pwd)/local"

node "$rootdir/bin/veendor.js" install -vvv --debug

if [[ "$(cat node_modules/proof.txt)" != "this was pulled from archive" ]]; then
    cat node_modules/proof.txt
    echo "localPull failed; node_modules/proof.txt is not there"
    exit 1;
fi
