const fsExtra = require('fs-extra');
const path = require('path');
const getLogger = require('../logger').getLogger;

function createCleanCacheDir(backend) {
    return new Promise((resolve, reject) => {
        const logger = getLogger();
        logger.trace(`Running 'createCleanCacheDir' for ${backend.alias}`);

        const cacheDirPath = path.resolve(process.cwd(), '.veendor', backend.alias);

        if (backend.backend.keepCache === true) {
            logger.trace(`Running 'ensureDir' for ${cacheDirPath}`);
            fsExtra.ensureDir(cacheDirPath)
                .then(() => resolve(cacheDirPath), reject);
        } else {
            logger.trace(`Running 'emptyDir' for ${cacheDirPath}`);
            fsExtra.emptyDir(cacheDirPath)
                .then(() => resolve(cacheDirPath), reject);
        }
    });
}

module.exports = {
    createCleanCacheDir,
};
