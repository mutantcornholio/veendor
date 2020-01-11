import path from 'path';
import fs from 'fs';
import fsExtra from 'fs-extra';
import * as tarWrapper from '../commandWrappers/tarWrapper';
import * as errors from '../errors';
import {Compression} from '../commandWrappers/tarWrapper';

export type LocalOptions = {
    compression: Compression,
    directory: string,
}

export function validateOptions(options: Partial<LocalOptions>) {
    if (options.compression && !(options.compression in tarWrapper.compression)) {
        throw new errors.InvalidOptionsError(`Invalid compression: ${options.compression}`);
    }

    if (!options.compression) {
        options.compression = 'gzip';
    }

    if (typeof options.directory !== 'string') {
        throw new errors.InvalidOptionsError(`Invalid directory '${options.directory}'`);
    }

    try {
        fs.readdirSync(options.directory);
    } catch (e) {
        throw new errors.InvalidOptionsError(`Invalid directory '${options.directory}': ${e.message}`);
    }
}

export function pull(hash: string, options: LocalOptions) {
    const archivePath = path.resolve(
        options.directory,
        `${hash}.tar${tarWrapper.compression[options.compression]}`
    );

    return fsExtra.stat(archivePath)
        .then(() => {
            return tarWrapper.extractArchive(archivePath);
        }, () => {
            throw new errors.BundleNotFoundError();
        })
}

export function push(hash: string, options: LocalOptions) {
    const archivePath = path.resolve(
        options.directory,
        `${hash}.tar${tarWrapper.compression[options.compression]}`
    );

    return fsExtra.stat(archivePath)
        .then(() => {
            throw new errors.BundleAlreadyExistsError();
        }, () => {
            return tarWrapper
                .createArchive(archivePath, [path.resolve(process.cwd(), 'node_modules')], options.compression);
        });
}
