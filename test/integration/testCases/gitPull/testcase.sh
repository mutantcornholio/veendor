#!/usr/bin/env bash

set -x

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

git clone "$(pwd)/repo" repolocal
cd repolocal
cp "$testdir/integration/bundles/7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz" .
git add 7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz
git commit -m "7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz"
git tag veendor-7d0db335c82dfd9aa2b96dabc485b89ebaa1496f
git push origin veendor-7d0db335c82dfd9aa2b96dabc485b89ebaa1496f
cd -
rm -rf repolocal

node "$rootdir/bin/veendor.js" install -vvv --debug

if [[ "$(cat node_modules/proof.txt)" != "this was pulled from archive" ]]; then
    cat node_modules/proof.txt
    echo "gitPull failed; node_modules/proof.txt is not there"
    exit 1;
fi
