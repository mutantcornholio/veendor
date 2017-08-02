#!/usr/bin/env bash

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

git clone "$(pwd)/repo" repolocal
cd repolocal
git checkout veendor-dffeec0effe0fa8c62c53017bcfbfd0275fd20c4
tar -xf dffeec0effe0fa8c62c53017bcfbfd0275fd20c4.tar.gz

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "gitPush failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

