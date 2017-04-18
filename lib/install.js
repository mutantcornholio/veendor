'use strict';
const fsz = require('mz/fs');
const path = require('path');
const pkgJsonCalc = require('./pkgjson');

const nodeModules = path.resolve(process.cwd(), 'node_modules');
/**
 * returns Promise
 */
function install({pkgJson, force = false, config}) {
    return new Promise((resolve, reject) => {
        let hash;

        checkPkgJson(pkgJson);

        checkNodeModules(force)
            .then(() => {
                hash = pkgJsonCalc.calcHash(pkgJson);
            }, reject)
            .then(() => pullBackends(hash, config))
            .then(resolve, reject);
    });
}

function checkPkgJson(pkgJson) {
    if (!pkgJson) {
        throw new EmptyPkgJsonError();
    } else if (!(pkgJson.dependencies instanceof Object) || !(pkgJson.devDependencies instanceof Object)) {
        throw new EmptyPkgJsonError('No dependencies or devDependencies supplied');
    }
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
            return reject(new BundlesNotFoundError('No more backends'));
        } else {
            config.backends[backendIndex]
                .pull(hash)
                .then(
                    resolve,
                    () => {pullBackends(hash, config, backendIndex + 1).then(resolve, reject)}
                );
        }
    });
}

class NodeModulesAlreadyExistError extends Error {}
class BundlesNotFoundError extends Error {}
class EmptyPkgJsonError extends Error {}

module.exports = install;
module.exports.NodeModulesAlreadyExistError = NodeModulesAlreadyExistError;
module.exports.BundlesNotFoundError = BundlesNotFoundError;
module.exports.EmptyPkgJsonError = EmptyPkgJsonError;
