#!/usr/bin/env bash

mkdir "$(pwd)/local"
export TEST_DIR="$(pwd)/local"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

npm_ver="$(npm --version)"

cd "$(pwd)/local"
if [[ "$npm_ver" == 3* ]] ||  [[ "$npm_ver" == 4* ]]; then
    tar -xf 29421e2947d74266c32bb6512faf066e42241702.tar.gz
else
    tar -xf 4e2e02f6b3001ddd45758f930a05f838eff60431.tar.gz # package-lock.json is created during the run
                                                            # veendor should recalculate hash and push new one
fi

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

