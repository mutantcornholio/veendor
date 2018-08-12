import crypto from 'crypto';
import fsExtra from 'fs-extra';
import os from 'os';
import path from 'path';
import {Transform, TransformCallback} from 'stream';
import {getLogger} from '../logger';
import {BackendConfig} from '@/types';
import cliProgress from 'cli-progress';
import colors from 'colors';

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


export class ProgressStream extends Transform {
    private progress: cliProgress.Bar;
    private completed: number;
    private haveTotal: boolean;
    private started: boolean;
    constructor(options: {}, title: string, private total?: number) {
        super(options);

        this.started = false;
        this.completed = 0;

        this.haveTotal = typeof this.total === 'number';

        const progressWithTotal = `  ${colors.green(title)} [{bar}]  `
            + `${colors.gray('{_value} / {_total} Mb')}   {percentage}%   {duration_formatted}`;

        const progressWithoutTotal = `  ${colors.green(title)} ${colors.gray('{_value} Mb')}   {duration_formatted}`;

        this.progress = new cliProgress.Bar({
            format: this.haveTotal ? progressWithTotal : progressWithoutTotal,
            barsize: 40,
            etaBuffer: 50,
        });

        this.once('end', () => {
            this.progress.stop();
        });

    }

    _transform(data: any, _encoding: string, callback: TransformCallback) {
        const total = typeof this.total === 'number' ? this.total : 1000;
        if (!this.started) {
            // this.progress.start(roundMb(total), 0);
            this.started = true;
        }


        this.completed += data.length;
        this.progress.update(roundMb(this.completed), {
            _value: formatMb(this.completed),
            _total: formatMb(total),
        });

        callback(undefined, data);
    }
}

function roundMb(bytes: number): number {
    return Math.floor((bytes / 1024 / 1024) * 100) / 100
}

function formatMb(bytes: number): string {
    return leftPad(7, roundMb(bytes).toFixed(2));
}

function leftPad(width: number, str: string): string {
    // https://stackoverflow.com/questions/5366849/convert-1-to-0001-in-javascript
    // @ts-ignore
    return Array(width).join(' ').substring(' ', width - str.length) + str;
}
