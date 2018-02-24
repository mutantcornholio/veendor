'use strict';

const path = require('path');

const helpers = require('./helpers');
const getLogger = require('../logger').getLogger;

class NotAGitRepoError extends Error {}
class GitIsNotADirectoryError extends Error {}
class GitLfsNotAvailableError extends Error {}
class TooOldRevisionError extends Error {}
class RefAlreadyExistsError extends Error {}


module.exports = {
    isGitRepo: directory => {
        const logger = getLogger();
        logger.trace(`isGitRepo: ${directory}`);
        return helpers.getOutput('git', ['rev-parse', '--git-dir'], {cwd: directory})
                .then(() => true, () => {throw new NotAGitRepoError});
    },
    isGitLfsAvailable: () => {
        return helpers.getOutput('git', ['lfs'])
            .then(() => {
                return helpers.getOutput('git', ['config', '--list'])
            })
            .then(gitConfig => {
                if (gitConfig.indexOf('filter.lfs.clean=') === -1
                    || gitConfig.indexOf('filter.lfs.smudge=') === -1
                    || gitConfig.indexOf('filter.lfs.process=') === -1) {
                    throw new Error();
                }
            })
            .then(() => true, () => {throw new GitLfsNotAvailableError})
    },
    /**
     * Returns contents of older revision of files
     * age == 1 means latest revision, age == 2 means previous, and so on
     * @param {string} gitDirectory
     * @param {string[]} filenames
     * @param {number} age
     * @returns {Promise}
     */
    olderRevision: (gitDirectory, filenames, age) => {
        const relativeFilename = filename => path.relative(gitDirectory, filename);

        return helpers
            .getOutput('git', ['--no-pager', 'log', `-${age}`, '--pretty=format:%h'].concat(
                filenames
                    .filter(filename => filename !== null)
                    .map(relativeFilename))
            )
            .then(revisionsStr => {
                const revisions = revisionsStr.trim().split('\n');
                if (revisions.length < age) {
                    throw new TooOldRevisionError();
                } else {
                    return Promise.all(filenames.map(filename => {
                        if (filename === null) {
                            return Promise.resolve(null);
                        }

                        return helpers.getOutput(
                            'git',
                            ['--no-pager', 'show', revisions[revisions.length - 1] + ':' + filename]
                        );
                    }));
                }
            });
    },
    clone: (repo, directory) => {
        return helpers.getOutput('git', ['clone', repo, directory], {pipeToParent: true});
    },
    fetch: (gitDirectory) => {
        return helpers.getOutput('git', ['fetch', '--tags'], {cwd: gitDirectory, pipeToParent: true});
    },
    lfsPull: (gitDirectory) => {
        return helpers.getOutput('git', ['lfs', 'pull'], {cwd: gitDirectory, pipeToParent: true});
    },
    checkout: (gitDirectory, gitId) => {
        return helpers.getOutput('git', ['checkout', gitId], {cwd: gitDirectory});
    },
    add: (gitDirectory, paths, force = false) => {
        const args = ['add'];
        if (force) {
            args.push('--force');
        }
        return helpers.getOutput('git', args.concat(paths), {cwd: gitDirectory});
    },
    commit: (gitDirectory, message) => {
        return helpers.getOutput('git', ['commit', '-m', message], {cwd: gitDirectory});
    },
    push: (gitDirectory, gitId) => {
        return helpers.getOutput('git', ['remote'], {cwd: gitDirectory})
            .then(remote => {
                return helpers.getOutput(
                    'git',
                    ['push', remote.trim(), gitId],
                    {cwd: gitDirectory, pipeToParent: true}
                );
            }).catch(error => {
                if (!(error instanceof helpers.CommandReturnedNonZeroError)) {
                    throw error;
                }

                if (error.output.indexOf(' already exists') !== -1) {
                    throw new RefAlreadyExistsError();
                }

                throw error;
            });
    },
    tag: (gitDirectory, tagName) => {
        return helpers.getOutput('git', ['tag', tagName], {cwd: gitDirectory})
            .catch(error => {
                if (!(error instanceof helpers.CommandReturnedNonZeroError)) {
                    throw error;
                }

                if (error.output.indexOf(' already exists') !== -1) {
                    throw new RefAlreadyExistsError();
                }

                throw error;
            });
    },
    resetToRemote: (gitDirectory, branch) => {
        return helpers.getOutput('git', ['remote'], {cwd: gitDirectory})
            .then(remote =>
                helpers.getOutput(
                    'git',
                    ['reset', '--hard', `${remote.trim()}/${branch}`],
                    {cwd: gitDirectory, pipeToParent: true}
                )
            );
    },
    NotAGitRepoError,
    GitIsNotADirectoryError,
    GitLfsNotAvailableError,
    TooOldRevisionError,
    RefAlreadyExistsError,
};
