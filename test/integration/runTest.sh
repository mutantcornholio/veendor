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
node_version="$3"
npm_version="$4"

export npm_config_prefix=
export NVM_DIR="${rootdir}/nvm"
source "${NVM_DIR}/nvm.sh"

rm -rf "${tmpdir}"
mkdir -p "${tmpdir}"

nvm use "${node_version}-${npm_version}"

cp "$dirname/testCases/$testcase/package.json" "$tmpdir"
cp "$dirname/testCases/$testcase/.veendor.js" "$tmpdir"
cd "$tmpdir"

source "$dirname/testCases/$testcase/testcase.sh"
