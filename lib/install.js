'use strict';
const fsz = require('mz/fs');
const path = require('path');
const pkgJsonCalc = require('./pkgjson');

const nodeModules = path.resolve(process.cwd(), 'node_modules');
/**
 * returns Promise
 */
function install({pkgJson, force = false}) {
    return new Promise((resolve, reject) => {
        let hash;
        checkPkgJson(pkgJson);
        checkNodeModules(force).then(() => {
            pkgJsonCalc.calcHash(pkgJson);
            resolve();
        }, reject);
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

class NodeModulesAlreadyExistError extends Error {}
class EmptyPkgJsonError extends Error {}

module.exports = install;
module.exports.NodeModulesAlreadyExistError = NodeModulesAlreadyExistError;
module.exports.EmptyPkgJsonError = EmptyPkgJsonError;
