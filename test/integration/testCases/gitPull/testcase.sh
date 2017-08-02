#!/usr/bin/env bash

create_empty_repo "$(pwd)/repo"
export TEST_REPO_DIR="$(pwd)/repo"

git clone "$(pwd)/repo" repolocal
cd repolocal
cp "$rootdir/test/integration/bundles/dffeec0effe0fa8c62c53017bcfbfd0275fd20c4.tar.gz" .
git add dffeec0effe0fa8c62c53017bcfbfd0275fd20c4.tar.gz
git commit -m "dffeec0effe0fa8c62c53017bcfbfd0275fd20c4.tar.gz"
git tag veendor-dffeec0effe0fa8c62c53017bcfbfd0275fd20c4
git push origin veendor-dffeec0effe0fa8c62c53017bcfbfd0275fd20c4
cd -
rm -rf repolocal

node "$rootdir/bin/veendor.js" install --debug

if [[ "$(cat node_modules/proof.txt)" != "this was pulled from archive" ]]; then
    cat node_modules/proof.txt
    echo "gitPull failed; node_modules/proof.txt is not there"
    exit 1;
fi
