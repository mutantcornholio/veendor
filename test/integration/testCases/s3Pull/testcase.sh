#!/usr/bin/env bash

mkdir "$(pwd)/local"

echo -e "\nRUNNING TEST\n"

curl -X PUT -T "$rootdir/test/integration/bundles/7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz" \
    -H 'Host: testbucket.s3.amazonaws.com' \
    http://localhost:14569/7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz

node "$rootdir/bin/veendor.js" install -vvv --debug

if [[ "$(cat node_modules/proof.txt)" != "this was pulled from archive" ]]; then
    cat node_modules/proof.txt
    echo "localPull failed; node_modules/proof.txt is not there"
    exit 1;
fi
