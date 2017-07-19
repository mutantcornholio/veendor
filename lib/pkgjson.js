/**
 * package.json-related stuff
 */
const crypto = require('crypto');
const _ = require('lodash');

/**
 * Calculates and returns hash of deps in package.json
 * @param  {Object} pkgJson
 * @return {String}
 */
function calcHash(pkgJson) {
    const sha1 = crypto.createHash('sha1');

    sha1.update(JSON.stringify(_.assign({}, pkgJson.dependencies, pkgJson.devDependencies)));

    return sha1.digest('hex');
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

class EmptyPkgJsonError extends Error {}

module.exports = {
    calcHash,
    parsePkgJson,
    EmptyPkgJsonError
};
