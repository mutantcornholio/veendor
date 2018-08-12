import path from 'path';
import * as helpers from './helpers';
import {StdioPolicy} from './helpers';
import * as errors from '../errors';
import {getLogger} from '../util/logger';

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
 */
export async function olderRevision(
    gitDirectory: string, filenames: Array<string | null>, age: number
): Promise<Array<string | null>> {
    const relativeFilenames = filenames.map(filename => {
        return typeof filename === 'string' ? path.relative(gitDirectory, filename): null;
    });

    const gitArgs = ['--no-pager', 'log', `-${age}`, '--pretty=format:%h'].concat(
        relativeFilenames.filter(filename => typeof filename === 'string') as string[]
    );

    const revisionsText = await helpers.getOutput('git', gitArgs);
    const revisions = revisionsText.trim().split('\n');

    if (revisions.length < age) {
        throw new TooOldRevisionError();
    }

    return Promise.all(relativeFilenames.map(filename => {
        if (typeof filename === 'string') {
            return helpers.getOutput(
                'git',
                ['--no-pager', 'show', revisions[revisions.length - 1] + ':' + filename]
            );
        } else {
            return Promise.resolve(null);
        }
    }));
}

export async function clone(repo: string, directory: string) {
    return helpers.getOutput('git', ['clone', repo, directory], {
        stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit
    });
}
export async function fetch(gitDirectory: string) {
    return helpers.getOutput('git', ['fetch', '--tags'], {
        cwd: gitDirectory, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit
    });
}

export async function lfsPull(gitDirectory: string) {
    return helpers.getOutput('git', ['lfs', 'pull'], {
        cwd: gitDirectory, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit
    });
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
                {cwd: gitDirectory, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit}
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
                {cwd: gitDirectory, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit}
            )
        );
}
