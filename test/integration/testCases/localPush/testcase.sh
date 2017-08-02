#!/usr/bin/env bash

mkdir "$(pwd)/local"
export TEST_DIR="$(pwd)/local"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

cd "$(pwd)/local"
tar -xf dffeec0effe0fa8c62c53017bcfbfd0275fd20c4.tar.gz

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

