#!/usr/bin/env bash

set -x

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

git clone "$(pwd)/repo" repolocal
cd repolocal
cp "$rootdir/test/integration/bundles/29421e2947d74266c32bb6512faf066e42241702.tar.gz" .
git add 29421e2947d74266c32bb6512faf066e42241702.tar.gz
git commit -m "29421e2947d74266c32bb6512faf066e42241702.tar.gz"
git tag veendor-29421e2947d74266c32bb6512faf066e42241702
git push origin veendor-29421e2947d74266c32bb6512faf066e42241702
cd -
rm -rf repolocal

node "$rootdir/bin/veendor.js" install --debug

if [[ "$(cat node_modules/proof.txt)" != "this was pulled from archive" ]]; then
    cat node_modules/proof.txt
    echo "gitPull failed; node_modules/proof.txt is not there"
    exit 1;
fi
