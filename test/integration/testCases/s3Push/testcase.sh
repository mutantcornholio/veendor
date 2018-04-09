#!/usr/bin/env bash

mkdir "$(pwd)/local"

echo -e "\nRUNNING TEST\n"

node "$rootdir/bin/veendor.js" install --debug

curl http://localhost:14569/7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz \
    -H 'Host: testbucket.s3.amazonaws.com' \
    -o 7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz

tar -xf 7d0db335c82dfd9aa2b96dabc485b89ebaa1496f.tar.gz

if [[ ! -f "node_modules/deep-object-diff/package.json" ]]; then
    echo "s3Push failed; node_modules/deep-object-diff/package.json is not there"
    exit 1;
fi

