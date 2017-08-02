#!/usr/bin/env bash

set -e

create_empty_repo () {
    git init --bare "$1"
    git clone "$1" repolocal
    cd repolocal
    git checkout -b master
    git commit --allow-empty -m "Initial commit"
    git push -u
    cd -
    rm -rf repolocal
}

rootdir="$(pwd)"
dirname="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
testcase="$1"
tmpdir="$2"

rm -rf "${tmpdir}"
mkdir -p "${tmpdir}"

cp "$dirname/testCases/$testcase/package.json" "$tmpdir"
cp "$dirname/testCases/$testcase/.veendor.js" "$tmpdir"
cd "$tmpdir"

source "$dirname/testCases/$testcase/testcase.sh"
