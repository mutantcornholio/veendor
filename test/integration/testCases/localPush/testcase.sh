#!/usr/bin/env bash

mkdir "$(pwd)/local"
export TEST_DIR="$(pwd)/local"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

cd "$(pwd)/local"
tar -xf 7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

