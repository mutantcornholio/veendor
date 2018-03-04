#!/usr/bin/env bash

mkdir "$(pwd)/local"
export TEST_DIR="$(pwd)/local"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

npm_ver="$(npm --version)"

cd "$(pwd)/local"
if [[ "$npm_ver" == 3* ]] ||  [[ "$npm_ver" == 4* ]]; then
    tar -xf 7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz
else
    tar -xf 1722dc5c5ee28cf0bcdc5ac1da82e0608b655f88.tar.gz # package-lock.json is created during the run
                                                            # veendor should recalculate hash and push new one
fi

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

