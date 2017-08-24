#!/usr/bin/env bash

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

git clone "$(pwd)/repo" repolocal
cd repolocal
git checkout veendor-1f15a972350cb78a37010a59330802b6fff35433
tar -xf 1f15a972350cb78a37010a59330802b6fff35433.tar.gz

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

