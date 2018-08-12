import crypto from 'crypto';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import {getLogger} from '../util/logger';
import {BackendConfig} from '@/types';

const originalCwd = process.cwd();

export async function createCleanCacheDir(backendConfig: BackendConfig): Promise<string> {
    const logger = getLogger();
    logger.trace(`Running 'createCleanCacheDir' for ${backendConfig.alias}`);

    const cacheDirPath = path.join(getTmpDir(), backendConfig.alias);

    if (backendConfig.backend.keepCache) {
        logger.trace(`Running 'ensureDir' for ${cacheDirPath}`);
        await fsExtra.ensureDir(cacheDirPath);
        return cacheDirPath;
    }

    logger.trace(`Running 'emptyDir' for ${cacheDirPath}`);
    return fsExtra.emptyDir(cacheDirPath)
        .then(() => {
            logger.trace(`Cache directory for backend '${backendConfig.alias}' is set`);
            return cacheDirPath;
        });
}

export async function createCleanCwd(lockfilePath: string | null) {
    const logger = getLogger();
    logger.trace('Running \'createCleanCwd\'');

    const newCwdDirPath = path.join(getTmpDir(), '__result');
    await fsExtra.ensureDir(newCwdDirPath);

    logger.trace(`New CWD:'${newCwdDirPath}'`);
    process.chdir(newCwdDirPath);
    await fsExtra.emptyDir(process.cwd());

    await fsExtra.copy(path.join(originalCwd, 'package.json'), path.join(process.cwd(), 'package.json'));
    if (lockfilePath !== null) {
        await fsExtra.copy(path.join(originalCwd, lockfilePath), path.join(process.cwd(), lockfilePath));
    }
}

export function getTmpDir() {
    const tmpDir = os.tmpdir();
    const cwdHash = crypto.createHash('sha1');
    cwdHash.update(process.cwd());
    return path.join(tmpDir, `veendor-${cwdHash.digest('hex')}`);
}

export function restoreCWD() {
    if (process.cwd() !== originalCwd) {
        const logger = getLogger();
        logger.trace(`Restoring CWD from '${process.cwd()}' to ${originalCwd}`);
        process.chdir(originalCwd);
    }
}

export const paths = {
    nodeModules: path.resolve(process.cwd(), 'node_modules'),
    pkgJsonPath: path.resolve(process.cwd(), 'package.json'),
    originalCwd,
};
