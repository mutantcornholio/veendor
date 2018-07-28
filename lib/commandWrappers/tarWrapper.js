'use strict';

const path = require('path');

const errors = require('../errors');
const helpers = require('./helpers');

const compression = {
    gzip: '.gz',
    bzip2: '.bz2',
    xz: '.xz'
};

function createArchive(outPath, inputPaths, compressionType) {
    const baseDir = path.dirname(inputPaths[0]);
    const pathsToAdd = inputPaths.map(p => path.relative(baseDir, p));
    const args = [
        '--create',
        `--${compressionType}`,
        '--file',
        outPath,
        ...pathsToAdd
    ];

    return helpers.getOutput('tar', args, {cwd: baseDir, pipeToParent: true});
}

function extractArchive(archive) {
    const args = ['--extract', '--file', archive];

    return helpers.getOutput('tar', args, {pipeToParent: true});
}

class ControlTokenError extends errors.VeendorError {}

function createStreamArchive(inputPaths, compressionType, {controlToken = {}}) {
    const baseDir = path.dirname(inputPaths[0]);
    const pathsToAdd = inputPaths.map(p => path.relative(baseDir, p));
    const args = [
        '--create',
        `--${compressionType}`,
        // '--file',
        '-',
        ...pathsToAdd
    ];

    const procPromise = helpers.getOutput('tar', args, {pipeToParent: false, controlToken, collectOutput: false});

    if (!controlToken.stdio) {
        throw new ControlTokenError('child_process stdio is not available');
    }

    return {
        stream: controlToken.stdio[1],
        promise: procPromise,
    };
}

function extractArchiveFromStream(archiveStream, {controlToken = {}}) {
    const args = ['--extract', '--file', '-'];

    const procPromise = helpers.getOutput('tar', args, {pipeToParent: false, controlToken, collectOutput: false});
    if (controlToken.stdio) {
        archiveStream.pipe(controlToken.stdio[0]);
        return procPromise;
    } else {
        throw new ControlTokenError('child_process stdio is not available');
    }
}

module.exports = {
    createArchive,
    createStreamArchive,
    extractArchive,
    extractArchiveFromStream,
    compression,
    ControlTokenError,
};
