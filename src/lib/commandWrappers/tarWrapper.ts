import path from 'path';
import {Readable} from 'stream';

import * as errors from '../errors';
import * as helpers from './helpers';
import {ControlToken} from './helpers';
import {StdioPolicy} from '@/lib/commandWrappers/helpers';


export type Compression = 'gzip'| 'bzip2' | 'xz'

export const compression = {
    gzip: '.gz',
    bzip2: '.bz2',
    xz: '.xz',
};


export function createArchive(outPath: string, inputPaths: string[], compressionType: string) {
    const baseDir = path.dirname(inputPaths[0]);
    const pathsToAdd = inputPaths.map(p => path.relative(baseDir, p));
    const args = [
        '--create',
        `--${compressionType}`,
        '--file',
        outPath,
        ...pathsToAdd
    ];

    return helpers.getOutput('tar', args, {cwd: baseDir, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit});
}

export function extractArchive(archive: string) {
    const args = ['--extract', '--file', archive];

    return helpers.getOutput('tar', args, {stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit});
}

class ControlTokenError extends errors.VeendorError {}

export function createStreamArchive(
    inputPaths: string[], compressionType: Compression, {controlToken = {}}: {controlToken: ControlToken}
): {stream: Readable, promise: Promise<string>} {
    const baseDir = path.dirname(inputPaths[0]);
    const pathsToAdd = inputPaths.map(p => path.relative(baseDir, p));
    const args = [
        '--create',
        `--${compressionType}`,
        '--file',
        '-',
        ...pathsToAdd,
    ];

    const procPromise = helpers.getOutput(
        'tar', args, {stdout: StdioPolicy.pipe, stderr: StdioPolicy.pipe, controlToken}
    );

    if (!controlToken.stdio) {
        throw new ControlTokenError('child_process stdio is not available');
    }

    return {
        stream: controlToken.stdio[1],
        promise: procPromise,
    };
}

export function extractArchiveFromStream(archiveStream: Readable, compressionType: Compression, {controlToken = {}}: {controlToken: ControlToken}) {
    const args = ['--extract', `--${compressionType}`, '--file', '-'];

    const procPromise = helpers.getOutput('tar', args, {
        stdout: StdioPolicy.pipe, stderr: StdioPolicy.pipe, controlToken
    });
    if (controlToken.stdio) {
        archiveStream.pipe(controlToken.stdio[0]);
        return procPromise;
    } else {
        throw new ControlTokenError('child_process stdio is not available');
    }
}
