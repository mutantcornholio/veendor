'use strict';

const path = require('path');
const fsz = require('mz/fs');

const gitWrapper = require('../commandWrappers/gitWrapper');
const tarWrapper = require('../commandWrappers/tarWrapper');
const errors = require('../errors');

module.exports = {
    _remoteIsFresh: false, // Exporting this for tests
    keepCache: true,
    validateOptions,
    pull,
    push
};

function validateOptions(options) {
    if (typeof options.repo !== 'string' || options.repo.length === 0) {
        throw new errors.InvalidOptionsError('Invalid git repo');
    }

    if (options.compression && !(options.compression in tarWrapper.compression)) {
        throw new errors.InvalidOptionsError(`Invalid compression: ${options.compression}`);
    }

    if (!options.compression) {
        options.compression = 'gzip';
    }

    if (!options.defaultBranch) {
        options.defaultBranch = 'master';
    }
}

function pull(hash, options, cacheDir) {
    return new Promise((resolve, reject) => {
        const repoDir = path.resolve(cacheDir, 'repo');
        gitWrapper.isGitRepo(repoDir)
            .then(() => {
                if (module.exports._remoteIsFresh) {
                    return Promise.resolve();
                }

                return gitWrapper.fetch(repoDir);
            }, () => {
                if (module.exports._remoteIsFresh) {
                    return Promise.resolve();
                }

                return gitWrapper.clone(options.repo, repoDir);
            })
            .then(() => {
                module.exports._remoteIsFresh = true;
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

function push(hash, options, cacheDir) {
    return new Promise((resolve, reject) => {
        const repoDir = path.resolve(cacheDir, 'repo');
        const archivePath = path.resolve(
            repoDir,
            `${hash}.tar${tarWrapper.compression[options.compression]}`
        );

        const tagName = `veendor-${hash}`;

        fsz.access(repoDir, fsz.constants.F_OK)
            .then(() => {
                return gitWrapper.fetch(repoDir);
            }, () => {
                return gitWrapper.clone(options.repo, repoDir);
            })
            .then(() => {
                return gitWrapper.checkout(repoDir, options.defaultBranch)
            })
            .then(() => {
                return tarWrapper.createArchive(archivePath, [path.resolve(
                    process.cwd(),
                    'node_modules'
                )], options.compression);
            })
            .then(() => {
                return gitWrapper.add(repoDir, [archivePath])
            })
            .then(() => {
                return gitWrapper.commit(repoDir, hash)
            })
            .then(() => {
                return gitWrapper.tag(repoDir, tagName)
            })
            .then(() => {
                return gitWrapper.push(repoDir, tagName)
            }).then(resolve, reject);
    });
}
