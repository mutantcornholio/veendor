#!/usr/bin/env bash

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

git clone "$(pwd)/repo" repolocal
cd repolocal

npm_ver="$(npm --version)"

if [[ "$npm_ver" == 3* ]] ||  [[ "$npm_ver" == 4* ]]; then
    git checkout veendor-7d0db335c82dfd9aa2b96dabc485b89ebaa1496f
    tar -xf 7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz
else
    git checkout veendor-1722dc5c5ee28cf0bcdc5ac1da82e0608b655f88
    tar -xf 1722dc5c5ee28cf0bcdc5ac1da82e0608b655f88.tar.gz # package-lock.json is created during the run
                                                            # veendor should recalculate hash and push new one
fi

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

