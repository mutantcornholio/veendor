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

    return sha1.digest();
}

module.exports = {
    calcHash: calcHash
};
