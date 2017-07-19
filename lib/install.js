'use strict';
const fsz = require('mz/fs');
const path = require('path');
const pkgJsonUtils = require('./pkgjson');
const gitWrapper = require('./commandWrappers/gitWrapper');
const npmWrapper = require('./commandWrappers/npmWrapper');
const objectDiff = require('deep-object-diff');
const _ = require('lodash');
const assert = require('assert');

const nodeModules = path.resolve(process.cwd(), 'node_modules');
const pkgJsonPath = path.resolve(process.cwd(), 'package.json');

/**
 * returns Promise
 */
function install({force = false, config}) {
    return new Promise((resolve, reject) => {
        let newPkgJson;
        let newPkgJsonHash;

        checkNodeModules(force)
            .then(() => {
                return fsz.readFile(pkgJsonPath)
            })
            .then(buf => {
                const pkgJsonString = buf.toString();

                return pkgJsonUtils.parsePkgJson(pkgJsonString);
            })
            .then(pkgJson => {
                newPkgJson = pkgJson;

                newPkgJsonHash = pkgJsonUtils.calcHash(pkgJson);

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
            })
            .catch(reject);
    });
}

function tryOlderBundles(config, newPkgJson, newPkgJsonHash) {
    return new Promise((resolve, reject) => {
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
        fsz.access(nodeModules).then(() => {
            if (force) {
                fsz.rmdir(nodeModules).then(resolve, reject);
            } else {
                reject(new NodeModulesAlreadyExistError);
            }
        }, resolve);
    });
}

function pullBackends(hash, config, backendIndex = 0) {
    return new Promise((resolve, reject) => {
        if (!config.backends[backendIndex]) {
            return reject(new BundlesNotFoundError(`Backends don't have bundle ${hash}`));
        }

        config.backends[backendIndex].backend.pull(hash)
            .then(
                resolve,
                () => {pullBackends(hash, config, backendIndex + 1).then(resolve, reject)}
            );
    });
}

function pullOlderBundle(config, historyIndex = 1) {
    return new Promise((resolve, reject) => {
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
        return backend.backend.push(hash);
    });

    return Promise.all(pushingPromises);
}

class NodeModulesAlreadyExistError extends Error {}
class BundlesNotFoundError extends Error {}

module.exports = install;
module.exports.NodeModulesAlreadyExistError = NodeModulesAlreadyExistError;
module.exports.BundlesNotFoundError = BundlesNotFoundError;

