'use strict';
const fsz = require('mz/fs');
const path = require('path');
const pkgJsonCalc = require('./pkgjson');
const gitWrapper = require('./commandWrappers/gitWrapper');

const nodeModules = path.resolve(process.cwd(), 'node_modules');
const pkgJsonPath = path.resolve(process.cwd(), 'package.json');
/**
 * returns Promise
 */
function install({force = false, config}) {
    return new Promise((resolve, reject) => {

        checkNodeModules(force)
            .then(() => {
                return fsz.readFile(pkgJsonPath)
            })
            .then(buf => {
                return pullBackendsForPkgJsonString(buf.toString(), config);
            })
            .then(resolve, error => {
                if (error instanceof BundlesNotFoundError) {
                    if (config.useGitHistory && config.useGitHistory.depth > 0) {
                        return pullOlderBundle(config);
                    }

                    return reject(error);
                }

                return reject(error);
            })
            .catch(reject);
    });
}

function pullBackendsForPkgJsonString(pkgJsonString, config) {
    return new Promise((resolve, reject) => {
        let pkgJson;
        let hash;

        parsePkgJson(pkgJsonString)
            .then(parsedPkgJson => {
                pkgJson = parsedPkgJson;
            })
            .then(() => {
                hash = pkgJsonCalc.calcHash(pkgJson);
            })
            .then(() => pullBackends(hash, config))
            .then(resolve, reject);
    });
}

function parsePkgJson(pkgJsonString) {
    return new Promise((resolve, reject) => {
        let pkgJson;

        try {
            pkgJson = JSON.parse(pkgJsonString);
        } catch (e) {
            return reject(e);
        }

        if (!(pkgJson.dependencies instanceof Object) || !(pkgJson.devDependencies instanceof Object)) {
            return reject(new EmptyPkgJsonError('No dependencies or devDependencies supplied'));
        }

        resolve(pkgJson);
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

        config.backends[backendIndex].pull(hash)
            .then(
                resolve,
                () => {pullBackends(hash, config, backendIndex + 1).then(resolve, reject)}
            );
    });
}

function pullOlderBundle(config, historyIndex = 1) {
    return new Promise((resolve, reject) => {
        if (historyIndex > config.useGitHistory.depth) {
            return reject(new BundlesNotFoundError(`Backends don't have bundles up to ${config.useGitHistory.depth}
             entries in git history of ${pkgJsonPath}`));
        }

        gitWrapper.olderRevision(pkgJsonPath, historyIndex + 1)
            .then(pkgJsonString => {
                return pullBackendsForPkgJsonString(pkgJsonString, config);
            })
            .then(
                resolve,
                () => {pullOlderBundle(config, historyIndex + 1).then(resolve, reject)}
            )
    })
}

class NodeModulesAlreadyExistError extends Error {}
class BundlesNotFoundError extends Error {}
class EmptyPkgJsonError extends Error {}

module.exports = install;
module.exports.NodeModulesAlreadyExistError = NodeModulesAlreadyExistError;
module.exports.BundlesNotFoundError = BundlesNotFoundError;
module.exports.EmptyPkgJsonError = EmptyPkgJsonError;
