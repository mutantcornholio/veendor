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
                logger.debug(`got dependencies:\t${JSON.stringify(pkgJson.dependencies)}`);
                logger.debug(`got devDependencies:\t${JSON.stringify(pkgJson.devDependencies)}`);

                logger.trace('calculating hash');

                newPkgJsonHash = pkgJsonUtils.calcHash(pkgJson);

                logger.info(`got hash:\t${newPkgJsonHash}`);

                return pullBackends(newPkgJsonHash, config);
            })
            .then(resolve, (error) => {
                if (error instanceof BundlesNotFoundError) {
                    if (config.useGitHistory && config.useGitHistory.depth > 0) {
                        return tryOlderBundles(config, newPkgJson, newPkgJsonHash)
                            .then(resolve, reject);
                    }
                }

                return reject(error);
            });
    });
}

function tryOlderBundles(config, newPkgJson, newPkgJsonHash) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();

        return gitWrapper.isGitRepo(path.dirname(pkgJsonPath))
            .then(() => {
                return pullOlderBundle(config);
            })
            .then((oldPkgJson) => {
                return installDiff(oldPkgJson, newPkgJson);
            })
            .then(() => {
                return pushBackends(config, newPkgJsonHash);
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

        logger.info(`trying backend '${config.backends[backendIndex].alias}' with hash ${hash}`);

        createCleanCacheDir(config.backends[backendIndex]).then(
            cacheDirPath => {
                logger.trace(`cache directory for backend '${config.backends[backendIndex].alias}' is set`);
                return config.backends[backendIndex].backend
                    .pull(hash, config.backends[backendIndex].options, cacheDirPath);
            },
            reject
        )
            .then(
                () => {
                    logger.info(`pulled ${hash} from backend ${config.backends[backendIndex].alias}`);
                    resolve();
                },
                () => {
                    pullBackends(hash, config, backendIndex + 1).then(resolve, reject)
                }
            );
    });
}

function pullOlderBundle(config, historyIndex = 1) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();

        let oldPkgJson;

        if (historyIndex > config.useGitHistory.depth) {
            return reject(new BundlesNotFoundError(`Backends don't have bundles up to ${config.useGitHistory.depth}
             entries in git history of ${pkgJsonPath}`));
        }

        gitWrapper.olderRevision(pkgJsonPath, historyIndex + 1)
            .then(pkgJsonString => {
                return pkgJsonUtils.parsePkgJson(pkgJsonString);
            })
            .then(pkgJson => {
                oldPkgJson = pkgJson;

                const hash = pkgJsonUtils.calcHash(pkgJson);

                return pullBackends(hash, config);
            })
            .then(
                () => {resolve(oldPkgJson)},
                () => {pullOlderBundle(config, historyIndex + 1).then(() => {resolve(oldPkgJson)}, reject)}
            )
    })
}

function installDiff(oldPkgJson, newPkgJson) {
    return new Promise((resolve, reject) => {
        const depsDiff = objectDiff.diff(oldPkgJson.dependencies, newPkgJson.dependencies);
        const depsUpdated = _.omitBy(depsDiff, _.isUndefined);
        const depsDeleted = _.keys(_.pickBy(depsDiff, _.isUndefined));

        const devDepsDiff = objectDiff.diff(oldPkgJson.devDependencies, newPkgJson.devDependencies);
        const devDepsUpdated = _.omitBy(devDepsDiff, _.isUndefined);
        const devDepsDeleted = _.keys(_.pickBy(devDepsDiff, _.isUndefined));

        const depsToInstall = Object.assign({}, depsUpdated, devDepsUpdated);
        const depsToUninstall = depsDeleted.concat(devDepsDeleted);

        if (_.keys(depsToInstall).length) {
            return npmWrapper.install(depsToInstall)
                .then(() => {
                    if (depsToUninstall.length) {
                        return npmWrapper.uninstall(depsToUninstall).then(resolve, reject);
                    }

                    resolve();
                }, reject);
        } else if (depsToUninstall.length) {
            return npmWrapper.uninstall(depsToUninstall).then(resolve, reject);
        }

        assert(false, 'Unreachable. install#installDiff is called without proper diff to install');
    });
}

function pushBackends(config, hash) {
    const pushingBackends = config.backends.filter(backend => backend.push === true);

    const pushingPromises = pushingBackends.map(backend => {
        return backend.backend.push(hash, backend.options);
    });

    return Promise.all(pushingPromises);
}

function createCleanCacheDir(backend) {
    return new Promise((resolve, reject) => {
        const cacheDirPath = path.resolve(process.cwd(), '.veendor', backend.alias);
        fsExtra.ensureDir(cacheDirPath)
            .then(() => resolve(cacheDirPath), reject);
    });
}

class NodeModulesAlreadyExistError extends Error {}
class BundlesNotFoundError extends Error {}

module.exports = install;
module.exports.NodeModulesAlreadyExistError = NodeModulesAlreadyExistError;
module.exports.BundlesNotFoundError = BundlesNotFoundError;

