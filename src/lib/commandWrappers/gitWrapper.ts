import path from 'path';
import helpers from './helpers';
import * as errors from '../errors';
import {getLogger} from '../logger';

export class NotAGitRepoError extends errors.VeendorError {}
export class GitIsNotADirectoryError extends errors.VeendorError {}
export class GitLfsNotAvailableError extends errors.VeendorError {}
export class TooOldRevisionError extends errors.VeendorError {}
export class RefAlreadyExistsError extends errors.VeendorError {}


export async function isGitRepo(directory: string): Promise<boolean> {
    const logger = getLogger();

    logger.trace(`isGitRepo: ${directory}`);

    try {
        await helpers.getOutput('git', ['rev-parse', '--git-dir'], {cwd: directory});

        return true;
    } catch(e) {
        return false;
    }
}

export async function isGitLfsAvailable() {
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
}


/**
 * Returns contents of older revision of files
 * age == 1 means latest revision, age == 2 means previous, and so on
 * @param {string} gitDirectory
 * @param {Array<string|null>} filenames
 * @param {number} age
 * @returns {Promise}
 */
export async function olderRevision<T extends (string | null), K extends keyof T>(
    gitDirectory: string, filenames: T[], age: number
): Promise<T[K]> {
    const relativeFilenames = filenames.map(filename => {
        return typeof filename === 'string' ? path.relative(gitDirectory, filename): null;
    });

    return helpers
        .getOutput('git', ['--no-pager', 'log', `-${age}`, '--pretty=format:%h'].concat(
            relativeFilenames.filter(filename => filename !== null) as string[]
        ))
        .then(revisionsStr => {
            const revisions = revisionsStr.trim().split('\n');
            if (revisions.length < age) {
                throw new TooOldRevisionError();
            } else {
                return Promise.all(relativeFilenames.map(filename => {
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
}

export async function clone(repo: string, directory: string) {
    return helpers.getOutput('git', ['clone', repo, directory], {pipeToParent: true});
}
export async function fetch(gitDirectory: string) {
    return helpers.getOutput('git', ['fetch', '--tags'], {cwd: gitDirectory, pipeToParent: true});
}

export async function lfsPull(gitDirectory: string) {
    return helpers.getOutput('git', ['lfs', 'pull'], {cwd: gitDirectory, pipeToParent: true});
}

export async function checkout(gitDirectory: string, gitId: string) {
    return helpers.getOutput('git', ['checkout', gitId], {cwd: gitDirectory});
}

export async function add(gitDirectory: string, paths: string[], force = false) {
    const args = ['add'];
    if (force) {
        args.push('--force');
    }
    return helpers.getOutput('git', args.concat(paths), {cwd: gitDirectory});
}
export async function commit(gitDirectory: string, message: string) {
    return helpers.getOutput('git', ['commit', '-m', message], {cwd: gitDirectory});
}

export async function push(gitDirectory: string, gitId: string) {
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
}
export async function tag(gitDirectory: string, tagName: string) {
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
}

export async function resetToRemote(gitDirectory: string, branch: string) {
    return helpers.getOutput('git', ['remote'], {cwd: gitDirectory})
        .then(remote =>
            helpers.getOutput(
                'git',
                ['reset', '--hard', `${remote.trim()}/${branch}`],
                {cwd: gitDirectory, pipeToParent: true}
            )
        );
}
