#!/usr/bin/env bash

set -ex

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

rootdir="$(pwd)/dist"
testdir="$(pwd)/dist/test"
dirname="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
testcase="$1"
tmpdir="$2"
cachedir="$3"
node_version="$4"
npm_version="$5"

export npm_config_prefix=
export NVM_DIR="$(pwd)/nvm"

rm -rf "${tmpdir}"
mkdir -p "${tmpdir}"

rm -rf "${cachedir}"
mkdir -p "${cachedir}"

echo "source nvm.sh"
set +x
source "${NVM_DIR}/nvm.sh"
set -x
nvm use "${node_version}-${npm_version}"

cp "$dirname/testCases/$testcase/package.json" "$tmpdir"
cp "$dirname/testCases/$testcase/.veendor.js" "$tmpdir"

if [[ -f "$dirname/testCases/$testcase/package-lock.json" ]]; then
    cp "$dirname/testCases/$testcase/package-lock.json" "$tmpdir"
fi

if [[ -f "$dirname/testCases/$testcase/npm-shrinkwrap.json" ]]; then
    cp "$dirname/testCases/$testcase/npm-shrinkwrap.json" "$tmpdir"
fi

cd "$tmpdir"

source "$dirname/testCases/$testcase/testcase.sh"
