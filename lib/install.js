'use strict';
const fsz = require('mz/fs');
const fsExtra = require('fs-extra');
const path = require('path');
const pkgJsonUtils = require('./pkgjson');
const gitWrapper = require('./commandWrappers/gitWrapper');
const npmWrapper = require('./commandWrappers/npmWrapper');
const objectDiff = require('deep-object-diff');
const _ = require('lodash');
const assert = require('assert');

const nodeModules = path.resolve(process.cwd(), 'node_modules');
const pkgJsonPath = path.resolve(process.cwd(), 'package.json');

const getLogger = require('./logger').getLogger;

/**
 * returns Promise
 */
function install({force = false, config}) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();
        let newPkgJson;
        let newPkgJsonHash;
        let done = false;
        let missingBackends = [];

        checkNodeModules(force)
            .then(() => {
                logger.trace('Reading package.json');
                return fsz.readFile(pkgJsonPath)
            })
            .then(buf => {
                const pkgJsonString = buf.toString();

                logger.trace('Parsing package.json');
                return pkgJsonUtils.parsePkgJson(pkgJsonString);
            })
            .then(pkgJson => {
                newPkgJson = pkgJson;
                logger.debug(`Got dependencies:\t${JSON.stringify(pkgJson.dependencies)}`);
                logger.debug(`Got devDependencies:\t${JSON.stringify(pkgJson.devDependencies)}`);

                logger.trace('Calculating hash');

                newPkgJsonHash = pkgJsonUtils.calcHash(pkgJson, config.packageHash);

                logger.info(`Got hash:\t${newPkgJsonHash}`);

                return pullBackends(newPkgJsonHash, config).then((info) => {
                    missingBackends = info.missingBackends;
                    done = true;
                });
            })
            .catch(error => {
                if (error instanceof BundlesNotFoundError) {
                    if (config.useGitHistory && config.useGitHistory.depth > 0) {
                        logger.trace(`Looking in git history with depth ${config.useGitHistory.depth}`);

                        return tryOlderBundles(config, newPkgJson, newPkgJsonHash);
                    } else if (config.fallbackToNpm === true) {
                        return npmInstallAll();
                    }

                    logger.error(
                        `Couldn't find bundle with hash '${newPkgJsonHash}'. 'fallbackToNpm' isn't set. Exiting`
                    );
                    done = true;

                    return reject(error);
                } else if (error.code === 'ENOENT' && error.message.indexOf('package.json') !== -1) {
                    throw new PkgJsonNotFoundError(error.message);
                }

                throw error;
            })
            .catch(error => {
                if (error instanceof BundlesNotFoundError && config.fallbackToNpm === true) {
                    return npmInstallAll();
                }

                throw error;
            })
            .then(() => {
                    if (done) {
                        if (missingBackends.length > 0) {
                            return pushBackends(missingBackends, newPkgJsonHash);
                        }

                        return;
                    }

                    return pushBackends(config.backends, newPkgJsonHash);
                })
            .then(resolve, reject);
    });
}

function tryOlderBundles(config, newPkgJson) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();
        logger.info('Trying backends with older bundles');

        return gitWrapper.isGitRepo(path.dirname(pkgJsonPath))
            .then(() => {
                return pullOlderBundle(config);
            })
            .then((oldPkgJson) => {
                return installDiff(oldPkgJson, newPkgJson);
            })
            .then(resolve)
            .catch(reject);
    });
}

function checkNodeModules(force) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();
        logger.trace('Checking node_modules');

        fsz.access(nodeModules).then(() => {
            logger.trace('\'node_modules\' directory already exists');

            if (force) {
                logger.info('Removing node_modules');
                fsExtra.remove(nodeModules, error => {
                    if (!error) {
                        resolve();
                    } else {
                        reject(error)
                    }
                });
            } else {
                reject(new NodeModulesAlreadyExistError);
            }
        }, resolve);
    });
}

function pullBackends(hash, config, backendIndex = 0) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();

        if (!config.backends[backendIndex]) {
            return reject(new BundlesNotFoundError(`Backends don't have bundle ${hash}`));
        }

        logger.info(`Trying backend '${config.backends[backendIndex].alias}' with hash ${hash}`);

        createCleanCacheDir(config.backends[backendIndex]).then(
            cacheDirPath => {
                logger.trace(`Cache directory for backend '${config.backends[backendIndex].alias}' is set`);
                return config.backends[backendIndex].backend
                    .pull(hash, config.backends[backendIndex].options, cacheDirPath);
            },
            reject
        )
            .then(
                () => {
                    logger.info(`Pulled ${hash} from backend '${config.backends[backendIndex].alias}'`);
                    resolve({missingBackends: config.backends.slice(0, backendIndex)});
                },
                () => {
                    pullBackends(hash, config, backendIndex + 1).then(resolve, reject)
                }
            );
    });
}

function pullOlderBundle(config, historyIndex = 0) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();

        let oldPkgJson;

        if (historyIndex > config.useGitHistory.depth) {
            return reject(new BundlesNotFoundError(`Backends don't have bundles up to ${config.useGitHistory.depth}
             entries in git history of ${pkgJsonPath}`));
        }

        gitWrapper.olderRevision(process.cwd(), pkgJsonPath, historyIndex + 1)
            .then(pkgJsonString => {
                return pkgJsonUtils.parsePkgJson(pkgJsonString);
            })
            .then(pkgJson => {
                oldPkgJson = pkgJson;

                logger.trace('Calculating hash');

                const hash = pkgJsonUtils.calcHash(pkgJson, config.packageHash);

                logger.info(`Got older hash: ${hash}`);

                return pullBackends(hash, config);
            })
            .then(
                () => {resolve(oldPkgJson)},
                () => {pullOlderBundle(config, historyIndex + 1).then(resolve, reject)}
            );
    })
}

function installDiff(oldPkgJson, newPkgJson) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();
        const depsDiff = objectDiff.diff(oldPkgJson.dependencies, newPkgJson.dependencies);
        const depsUpdated = _.omitBy(depsDiff, _.isUndefined);
        const depsDeleted = _.keys(_.pickBy(depsDiff, _.isUndefined));

        const devDepsDiff = objectDiff.diff(oldPkgJson.devDependencies, newPkgJson.devDependencies);
        const devDepsUpdated = _.omitBy(devDepsDiff, _.isUndefined);
        const devDepsDeleted = _.keys(_.pickBy(devDepsDiff, _.isUndefined));

        const depsToInstall = Object.assign({}, depsUpdated, devDepsUpdated);
        const depsToUninstall = depsDeleted.concat(devDepsDeleted);

        const loggingDepsToInstall = 'Installing dependencies: ' +
            Object.keys(depsToInstall).map(pkg => `${pkg}@${depsToInstall[pkg]}`).join(' ');

        const loggingDepsToUninstall = 'Uninstalling dependencies: ' + depsToUninstall.join(' ');

        if (_.keys(depsToInstall).length) {
            logger.info(loggingDepsToInstall);

            return npmWrapper.install(depsToInstall)
                .then(() => {
                    if (depsToUninstall.length) {
                        logger.info(loggingDepsToUninstall);
                        return npmWrapper.uninstall(depsToUninstall).then(resolve, reject);
                    }

                    resolve();
                }, reject);
        } else if (depsToUninstall.length) {
            logger.info(loggingDepsToUninstall);
            return npmWrapper.uninstall(depsToUninstall).then(resolve, reject);
        }

        assert(false, 'Unreachable. install#installDiff is called without proper diff to install');
    });
}

function pushBackends(backends, hash) {
    const logger = getLogger();
    logger.trace(`Pushing '${hash}' to backends`);

    const pushingBackends = backends.filter(backend => backend.push === true);

    if (pushingBackends.length === 0) {
        logger.info(`No backends with push: true found. Exiting`);
    }

    const dirPromises = pushingBackends.map(backend => {
        return createCleanCacheDir(backend);
    });

    return Promise.all(dirPromises)
        .then((cacheDirs) => {
            const pushingPromises = [];

            for (const [index, backend] of pushingBackends.entries()) {
                logger.info(`Pushing '${hash}' to '${backend.alias}' backend`);
                pushingPromises.push(backend.backend.push(hash, backend.options, cacheDirs[index]));
            }

            return Promise.all(pushingPromises);
        })
}

function createCleanCacheDir(backend) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();
        logger.trace(`Running 'createCleanCacheDir' for ${backend.alias}`);

        const cacheDirPath = path.resolve(process.cwd(), '.veendor', backend.alias);

        if (backend.backend.keepCache === true) {
            logger.trace(`Running 'ensureDir' for ${cacheDirPath}`);
            fsExtra.ensureDir(cacheDirPath)
                .then(() => resolve(cacheDirPath), reject);
        } else {
            logger.trace(`Running 'emptyDir' for ${cacheDirPath}`);
            fsExtra.emptyDir(cacheDirPath)
                .then(() => resolve(cacheDirPath), reject);
        }
    });
}

function npmInstallAll() {
    const logger = getLogger();

    logger.info('Couldn\'t find bundles. Running npm install');

    return npmWrapper.installAll();
}

class PkgJsonNotFoundError extends Error {}
class NodeModulesAlreadyExistError extends Error {}
class BundlesNotFoundError extends Error {}

module.exports = install;
module.exports.NodeModulesAlreadyExistError = NodeModulesAlreadyExistError;
module.exports.BundlesNotFoundError = BundlesNotFoundError;
module.exports.PkgJsonNotFoundError = PkgJsonNotFoundError;

