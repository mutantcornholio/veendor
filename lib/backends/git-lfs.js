'use strict';

const path = require('path');

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
        gitWrapper.clone(options.repo, path.resolve(cacheDir, 'repo')).then(resolve, reject);
    });
}

module.exports = {
    validateOptions,
    pull
};
