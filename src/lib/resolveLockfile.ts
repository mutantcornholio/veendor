'use strict';

import fs from 'fs';
import util from 'util';

import fsExtra from 'fs-extra';
import path from 'path';
import {getLogger} from "@/lib/logger";

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

function getLockfile(results: Array<fs.Stats|NodeJS.ErrnoException>) {
    const logger = getLogger();

    for (let i=0; i < LOCKFILE_TYPES.length; i++) {
        if (util.isError(results[i])) {
            const err = <NodeJS.ErrnoException>(results[i]);
            if (err.code && err.code === 'ENOENT') {
                continue;
            }

            throw err;
        }

        logger.info(`Found '${LOCKFILE_TYPES[i]}'. Using it to calculate bundle hashes.`);
        return LOCKFILE_TYPES[i];
    }

    return null;
}
