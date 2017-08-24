/**
 * package.json-related stuff
 */
const crypto = require('crypto');
const _ = require('lodash');

/**
 * Calculates and returns hash of deps in package.json
 * @param  {Object} pkgJson
 * @param  {Object} options
 * @return {String}
 */
function calcHash(pkgJson, options = {}) {
    const sha1 = crypto.createHash('sha1');
    const resultDeps = [];
    const addPkgString = (version, pack) => resultDeps.push(`${pack}@${version}`);

    _.forOwn(pkgJson.dependencies, addPkgString);
    _.forOwn(pkgJson.devDependencies, addPkgString);

    sha1.update(JSON.stringify(resultDeps.sort()));

    const result = sha1.digest('hex');

    if (typeof options.suffix === 'string') {
        return result + '-' + options.suffix;
    }

    if (typeof options.suffix === 'function') {
        return result + '-' + options.suffix();
    }

    return result;
}

function parsePkgJson(pkgJsonString) {
    return new Promise((resolve, reject) => {
        let pkgJson;

        try {
            pkgJson = JSON.parse(pkgJsonString);
        } catch (e) {
            return reject(e);
        }

        if (!(pkgJson.dependencies instanceof Object) && !(pkgJson.devDependencies instanceof Object)) {
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
