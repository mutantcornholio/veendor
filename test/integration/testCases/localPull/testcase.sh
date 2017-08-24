#!/usr/bin/env bash

mkdir "$(pwd)/local"
export TEST_DIR="$(pwd)/local"

cp "$rootdir/test/integration/bundles/1f15a972350cb78a37010a59330802b6fff35433.tar.gz" local/

node "$rootdir/bin/veendor.js" install --debug

if [[ "$(cat node_modules/proof.txt)" != "this was pulled from archive" ]]; then
    cat node_modules/proof.txt
    echo "localPull failed; node_modules/proof.txt is not there"
    exit 1;
fi
