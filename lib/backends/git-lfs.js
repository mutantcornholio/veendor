'use strict';

const path = require('path');
const fsz = require('mz/fs');

const gitWrapper = require('../commandWrappers/gitWrapper');
const tarWrapper = require('../commandWrappers/tarWrapper');
const errors = require('./errors');

function validateOptions(options) {
    if (typeof options.repo !== 'string' || options.repo.length === 0) {
        throw new errors.InvalidOptionsError('Invalid git repo');
    }

    if (options.compression && !(options.compression in Object.keys(tarWrapper.compression))) {
        throw new errors.InvalidOptionsError(`Invalid compression: ${options.compression}`);
    }

    if (!options.compression) {
        options.compression = 'gzip';
    }
}

function pull(hash, options, cacheDir) {
    return new Promise((resolve, reject) => {
        const repoDir = path.resolve(cacheDir, 'repo');
        fsz.access(repoDir, fsz.constants.F_OK)
            .then(() => {
                return gitWrapper.fetch(repoDir);
            }, () => {
                return gitWrapper.clone(options.repo, repoDir);
            })
            .then(() => {
                return gitWrapper.checkout(repoDir, `veendor-${hash}`)
                    .then(() => {
                        return tarWrapper.extractArchive(
                            path.resolve(
                                repoDir,
                                `${hash}.tar${tarWrapper.compression[options.compression]}`
                            )
                        );
                    }, () => {
                        reject(new errors.BundleNotFoundError);
                    });
            })
            .then(resolve, reject);
    });
}

function push() {
    return Promise.resolve();
}

module.exports = {
    validateOptions,
    pull,
    push
};
