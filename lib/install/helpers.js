const fsExtra = require('fs-extra');
const path = require('path');
const getLogger = require('../logger').getLogger;

const originalCwd = process.cwd();

function createCleanCacheDir(backend) {
    const logger = getLogger();
    logger.trace(`Running 'createCleanCacheDir' for ${backend.alias}`);

    const cacheDirPath = path.resolve(originalCwd, '.veendor', backend.alias);

    if (backend.backend.keepCache === true) {
        logger.trace(`Running 'ensureDir' for ${cacheDirPath}`);
        return fsExtra.ensureDir(cacheDirPath)
            .then(() => cacheDirPath);
    }

    logger.trace(`Running 'emptyDir' for ${cacheDirPath}`);
    return fsExtra.emptyDir(cacheDirPath)
        .then(() => cacheDirPath);
}

function createCleanCwd() {
    const logger = getLogger();
    logger.trace('Running \'createCleanCwd\'');

    const newCwdDirPath = path.resolve(originalCwd, '.veendor', '__result');

    return fsExtra.emptyDir(newCwdDirPath)
        .then(() => process.chdir(newCwdDirPath));
}

function restoreCWD() {
    process.chdir(originalCwd);
}

module.exports = {
    createCleanCacheDir,
    createCleanCwd,
    restoreCWD,
};
