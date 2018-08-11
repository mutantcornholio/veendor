'use strict';

const path = require('path');
const fsExtra = require('fs-extra');

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
    return new Promise((resolve, reject) => {
        if (typeof options.repo !== 'string' || options.repo.length === 0) {
            return reject(new errors.InvalidOptionsError('Invalid git repo'));
        }

        if (options.compression && !(options.compression in tarWrapper.compression)) {
            return reject(new errors.InvalidOptionsError(`Invalid compression: ${options.compression}`));
        }

        if (options.compression === undefined) {
            options.compression = 'gzip';
        }

        if (options.defaultBranch === undefined) {
            options.defaultBranch = 'master';
        }

        if (options.checkLfsAvailability === undefined) {
            options.checkLfsAvailability = false;

            resolve();
        } else {
            if (typeof options.checkLfsAvailability !== 'boolean') {
                return reject(new errors.InvalidOptionsError(
                    `Invalid 'checkLfsAvailability' option: ${options.checkLfsAvailability}`
                ));
            }

            if (options.checkLfsAvailability === true) {
                gitWrapper.isGitLfsAvailable().then(resolve, () => {
                    reject(new gitWrapper.GitLfsNotAvailableError(
                        'git-lfs is not available. Check git-lfs.github.com for docs.'
                    ));
                });
            }
        }
    });
}

function pull(hash, options, cacheDir) {
    const repoDir = path.resolve(cacheDir, 'repo');
    return gitWrapper.isGitRepo(repoDir)
        .then(res => {
            if (res) {
                if (module.exports._remoteIsFresh) {
                    return Promise.resolve();
                }

                return gitWrapper.fetch(repoDir);
            } else {

                if (module.exports._remoteIsFresh) {
                    return Promise.resolve();
                }

                return gitWrapper.clone(options.repo, repoDir);
            }
        })
        .then(() => {
            module.exports._remoteIsFresh = true;
            return gitWrapper.checkout(repoDir, `veendor-${hash}`)
                .then(() => {
                    return new Promise((resolve, reject) => {
                        gitWrapper.isGitLfsAvailable().then(() => {
                            gitWrapper.lfsPull(repoDir).then(resolve, reject);
                        }, resolve);
                    });
                }, () => {
                    throw new errors.BundleNotFoundError;
                })
                .then(() => {
                    return tarWrapper.extractArchive(
                        path.resolve(
                            repoDir,
                            `${hash}.tar${tarWrapper.compression[options.compression]}`
                        )
                    );
                });
        });
}

function push(hash, options, cacheDir) {
    const repoDir = path.resolve(cacheDir, 'repo');
    const archivePath = path.resolve(
        repoDir,
        `${hash}.tar${tarWrapper.compression[options.compression]}`
    );

    const tagName = `veendor-${hash}`;

    return fsExtra.access(repoDir, fsExtra.constants.F_OK)
        .then(() => {
            return gitWrapper.fetch(repoDir);
        }, () => {
            return gitWrapper.clone(options.repo, repoDir);
        })
        .then(() => {
            return gitWrapper.checkout(repoDir, options.defaultBranch)
        })
        .then(() => {
            return gitWrapper.resetToRemote(repoDir, options.defaultBranch)
        })
        .then(() => {
            return tarWrapper.createArchive(archivePath, [path.resolve(
                process.cwd(),
                'node_modules'
            )], options.compression);
        })
        .then(() => {
            return gitWrapper.add(repoDir, [archivePath], true)
        })
        .then(() => {
            return gitWrapper.commit(repoDir, hash)
        })
        .then(() => {
            return gitWrapper.tag(repoDir, tagName)
        })
        .then(() => {
            return gitWrapper.push(repoDir, tagName)
        })
        .catch(error => {
            if (error instanceof gitWrapper.RefAlreadyExistsError) {
                throw new errors.BundleAlreadyExistsError();
            }

            throw error;
        });
}
