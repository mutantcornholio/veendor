#!/usr/bin/env bash

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

git clone "$(pwd)/repo" repolocal
cd repolocal

npm_ver="$(npm --version)"

if [[ "$npm_ver" == 3* ]] ||  [[ "$npm_ver" == 4* ]]; then
    git checkout veendor-29421e2947d74266c32bb6512faf066e42241702
    tar -xf 29421e2947d74266c32bb6512faf066e42241702.tar.gz
else
    git checkout veendor-4e2e02f6b3001ddd45758f930a05f838eff60431
    tar -xf 4e2e02f6b3001ddd45758f930a05f838eff60431.tar.gz # package-lock.json is created during the run
                                                            # veendor should recalculate hash and push new one
fi

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

