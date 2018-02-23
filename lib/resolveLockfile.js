'use strict';

const fsExtra = require('fs-extra');
const path = require('path');

const getLogger = require('./logger').getLogger;

// add yarn.lock one day
const LOCKFILE_TYPES = ['npm-shrinkwrap.json', 'package-lock.json'];

module.exports = function resolveLockfile() {
    const logger = getLogger();
    logger.trace(`Looking for lockfiles: ${LOCKFILE_TYPES.join(', ')}`);
    const statPromises = LOCKFILE_TYPES.map(
        filename => fsExtra
            .stat(path.resolve(process.cwd(), filename))
            .catch(error => error)); // not letting Promise.all to reject early

    return Promise.all(statPromises).then(getLockfile);
};

function getLockfile(results) {
    const logger = getLogger();

    for (let i=0; i < LOCKFILE_TYPES.length; i++) {
        if (results[i].code && results[i].code === 'ENOENT') {
            continue;
        }

        logger.info(`Found '${LOCKFILE_TYPES[i]}'. Using it to calculate bundle hashes.`);
        return LOCKFILE_TYPES[i];
    }

    return null;
}
