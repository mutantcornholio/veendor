'use strict';

const path = require('path');

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

module.exports = {
    createArchive,
    extractArchive,
    compression
};
