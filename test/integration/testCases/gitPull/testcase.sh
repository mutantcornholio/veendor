#!/usr/bin/env bash

set -x

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

git clone "$(pwd)/repo" repolocal
cd repolocal
cp "$rootdir/test/integration/bundles/1f15a972350cb78a37010a59330802b6fff35433.tar.gz" .
git add 1f15a972350cb78a37010a59330802b6fff35433.tar.gz
git commit -m "1f15a972350cb78a37010a59330802b6fff35433.tar.gz"
git tag veendor-1f15a972350cb78a37010a59330802b6fff35433
git push origin veendor-1f15a972350cb78a37010a59330802b6fff35433
cd -
rm -rf repolocal

node "$rootdir/bin/veendor.js" install --debug

if [[ "$(cat node_modules/proof.txt)" != "this was pulled from archive" ]]; then
    cat node_modules/proof.txt
    echo "gitPull failed; node_modules/proof.txt is not there"
    exit 1;
fi
