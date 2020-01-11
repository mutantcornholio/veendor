#!/usr/bin/env bash

export NVM_DIR="$(pwd)/nvm"

mkdir -p "${NVM_DIR}"

if [ ! -f "${NVM_DIR}/nvm.sh" ]; then
    curl "https://raw.githubusercontent.com/creationix/nvm/master/nvm.sh" > "${NVM_DIR}/nvm.sh";
fi

export npm_config_prefix=
source "${NVM_DIR}/nvm.sh"

while [ $# -gt 0 ]; do
    node_version="$1"; shift
    npm_version="$1"; shift
    if nvm use "${node_version}-${npm_version}"; then
        :
    else
        nvm install "${node_version}"
        nvm use "${node_version}"
        npm install -g "npm@${npm_version}"
        mv "${NVM_DIR}/versions/node/${node_version}" "${NVM_DIR}/versions/node/${node_version}-${npm_version}"
        nvm alias default "${node_version}-${npm_version}"  # nvm will use first installed version as default.
                                                            # After moving it, deafult version will be lost
                                                            # forcing it to remain
    fi
done
