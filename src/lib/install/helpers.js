const crypto = require('crypto');
const fsExtra = require('fs-extra');
const os = require('os');
const path = require('path');
const getLogger = require('../logger').getLogger;

const originalCwd = process.cwd();

function createCleanCacheDir(backend) {
    const logger = getLogger();
    logger.trace(`Running 'createCleanCacheDir' for ${backend.alias}`);

    let cacheDirPath;

    cacheDirPath = path.join(getTmpDir(), backend.alias);

    if (backend.backend.keepCache === true) {
        logger.trace(`Running 'ensureDir' for ${cacheDirPath}`);
        return fsExtra.ensureDir(cacheDirPath)
            .then(() => cacheDirPath);
    }

    logger.trace(`Running 'emptyDir' for ${cacheDirPath}`);
    return fsExtra.emptyDir(cacheDirPath)
        .then(() => cacheDirPath)
        .then(a => {
            return a;
        });
}

function createCleanCwd() {
    const logger = getLogger();
    logger.trace('Running \'createCleanCwd\'');

    const newCwdDirPath = path.join(getTmpDir(), '__result');
    return fsExtra.ensureDir(newCwdDirPath)
        .then(() => process.chdir(newCwdDirPath))
        .then(() => fsExtra.emptyDir(process.cwd()))
        .then(() => fsExtra.copy(path.join(originalCwd, 'package.json'), path.join(process.cwd(), 'package.json')));
}

function getTmpDir() {
    const tmpDir = os.tmpdir();
    const cwdHash = crypto.createHash('sha1');
    cwdHash.update(process.cwd());
    return path.join(tmpDir, `veendor-${cwdHash.digest('hex')}`);
}

function restoreCWD() {
    process.chdir(originalCwd);
}

module.exports = {
    createCleanCacheDir,
    createCleanCwd,
    restoreCWD,
    getTmpDir,
};
