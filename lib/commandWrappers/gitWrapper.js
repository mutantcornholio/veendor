'use strict';

const path = require('path');
const fs = require('mz/fs');

const helpers = require('./helpers');
const getLogger = require('../logger').getLogger;

class NotAGitRepoError extends Error {}
class GitIsNotADirectoryError extends Error {}
class TooOldRevisionError extends Error {}


module.exports = {
    isGitRepo: directory => {
        const logger = getLogger();
        logger.trace(`isGitRepo: ${directory}`);
        return helpers.getOutput('git', ['rev-parse', '--git-dir'])
                .then(() => {return true}, () => {throw new NotAGitRepoError});
    },
    /**
     * Returns contents of older revision of file
     * age == 1 means latest revision, age == 2 means previous, and so on
     * @param {string} gitDirectory
     * @param {string} filename
     * @param {number} age
     * @returns {Promise}
     */
    olderRevision: (gitDirectory, filename, age) => {
        return new Promise((resolve, reject) => {
            const relativeFilename = path.relative(gitDirectory, filename);

            helpers
                .getOutput('git', ['--no-pager', 'log', `-${age}`, '--pretty=format:%h', relativeFilename])
                .then(revisionsStr => {
                    const revisions = revisionsStr.trim().split('\n');
                    if (revisions.length < age) {
                        reject(new TooOldRevisionError());
                    } else {
                        helpers.getOutput(
                            'git',
                            ['--no-pager', 'show', revisions[revisions.length - 1] + ':' + relativeFilename]
                        )
                            .then(resolve, reject);
                    }
                }, reject);
        });
    },
    clone: (repo, directory) => {
        return helpers.runInherited('git', ['clone', repo, directory]);
    },
    fetch: (gitDirectory) => {
        return helpers.runInherited('git', ['fetch'], {cwd: gitDirectory});
    },
    checkout: (gitDirectory, gitId) => {
        return helpers.getOutput('git', ['checkout', gitId], {cwd: gitDirectory});
    },
    add: (gitDirectory, paths) => {
        return helpers.getOutput('git', ['add', ...paths], {cwd: gitDirectory});
    },
    commit: (gitDirectory, message) => {
        return helpers.getOutput('git', ['commit', '-m', message], {cwd: gitDirectory});
    },
    push: (gitDirectory, gitId) => {
        // FIXME: understand default remote
        return helpers.runInherited('git', ['push', 'origin', gitId], {cwd: gitDirectory});
    },
    tag: (gitDirectory, tagName) => {
        return helpers.getOutput('git', ['tag', tagName], {cwd: gitDirectory});
    },
    NotAGitRepoError,
    GitIsNotADirectoryError,
    TooOldRevisionError,
};
