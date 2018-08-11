/**
 * package.json-related stuff
 */
const crypto = require('crypto');

const errors = require('./errors');
const deepSortedJson = require('./deepSortedJson');

/**
 * Calculates and returns hash of deps in package.json
 * @param  {Object} pkgJson
 * @param {null|Object} lockfileContents
 * @param  {Object} options
 * @return {string}
 */
function calcHash(pkgJson, lockfileContents = null, options = {}) {
    const resultSha1 = crypto.createHash('sha1');

    let sortedDeps = deepSortedJson.transform({
        dependencies: pkgJson.dependencies,
        devDependencies: pkgJson.devDependencies,
    });

    if (lockfileContents) {
        sortedDeps = sortedDeps.concat(deepSortedJson.transform(lockfileContents));
    }

    resultSha1.update(sortedDeps.join('\n'));

    const result = resultSha1.digest('hex');

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

class EmptyPkgJsonError extends errors.VeendorError {}

module.exports = {
    calcHash,
    parsePkgJson,
    EmptyPkgJsonError,
};
