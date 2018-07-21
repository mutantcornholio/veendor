#!/usr/bin/env bash

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install -vvv --debug

git clone "$(pwd)/repo" repolocal
cd repolocal

npm_ver="$(npm --version)"

git checkout veendor-7d0db335c82dfd9aa2b96dabc485b89ebaa1496f
tar -xf 7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

