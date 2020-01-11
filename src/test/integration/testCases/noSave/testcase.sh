#!/usr/bin/env bash

set -x

create_empty_repo "$(pwd)/repo"
git clone "$(pwd)/repo" repolocal
cd repolocal

export TEST_DIR="$tmpdir/local"
mkdir -p $TEST_DIR

find "$testdir/integration/testCases/noSave" -type f -maxdepth 1 -print0 | xargs -0 -I{} -n1 cp "{}" .

run_iteration() {
    cp package.json package.json.bak

    git add -A
    git commit -m "1"

    node "$rootdir/bin/veendor.js" install -vvv --debug

    if ! diff -q package.json package.json.bak; then
        echo "package.json changed and it shouldn't have"
        exit 1;
    fi
}

run_iteration

cp package2.json package.json

run_iteration

cp package3.json package.json

run_iteration
