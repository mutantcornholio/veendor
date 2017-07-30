'use strict';

const path = require('path');
const fs = require('fs');
const fsExtra = require('fs-extra');

const tarWrapper = require('../commandWrappers/tarWrapper');
const errors = require('../errors');

module.exports = {
    validateOptions,
    pull,
    push
};

function validateOptions(options) {
    if (options.compression && !(options.compression in tarWrapper.compression)) {
        throw new errors.InvalidOptionsError(`Invalid compression: ${options.compression}`);
    }

    if (!options.compression) {
        options.compression = 'gzip';
    }

    try {
        fs.readdirSync(options.directory);
    } catch (e) {
        throw new errors.InvalidOptionsError(`Invalid directory '${options.directory}': ${e.message}`);
    }
}

function pull(hash, options) {
    return new Promise((resolve, reject) => {
        const archivePath = path.resolve(
            options.directory,
            `${hash}.tar${tarWrapper.compression[options.compression]}`
        );

        fsExtra.stat(archivePath)
            .then(() => {
                return tarWrapper.extractArchive(archivePath);
            }, (err) => {
                throw new errors.BundleNotFoundError();
            })
            .then(resolve, reject)
    });
}

function push(hash, options) {
    const archivePath = path.resolve(
        options.directory,
        `${hash}.tar${tarWrapper.compression[options.compression]}`
    );

    return tarWrapper.createArchive(archivePath, [path.resolve(process.cwd(), 'node_modules')], options.compression);
}
