'use strict';

const path = require('path');
const fsz = require('mz/fs');

const gitWrapper = require('../commandWrappers/gitWrapper');
const errors = require('./errors');

function validateOptions(options) {
    if (typeof options.repo !== 'string' || options.repo.length === 0) {
        throw new errors.InvalidOptionsError('Invalid git repo');
    }

    if (options.compression && !(options.compression in ['gz', 'bz2', 'xz'])) {
        throw new errors.InvalidOptionsError(`Invalid compression: ${options.compression}`);
    }

    if (!options.compression) {
        options.compression = 'gz';
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
                return gitWrapper.checkout(repoDir, hash);
            }, reject)
            .then(resolve, () => {
                reject(new errors.BundleNotFoundError);
            });
    });
}

module.exports = {
    validateOptions,
    pull
};
