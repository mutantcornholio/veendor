import _ from 'lodash';
import chai from 'chai';
import path from 'path';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import * as gitWrapper from '@/lib/commandWrappers/gitWrapper';
import * as commandWrappers from '@/lib/commandWrappers/helpers';
import {AnError, notifyAssert} from './helpers';

const assert = chai.assert;
chai.use(chaiAsPromised);

describe('gitWrapper', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('.isGitLfsAvailable', () => {
        it('should reject with GitLfsNotAvailableError if `git lfs` returns non-zero', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[0] === 'lfs') {
                    return Promise.reject('\'lfs\' is not a git command.\n');
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.isGitLfsAvailable();

            return assert.isRejected(result, gitWrapper.GitLfsNotAvailableError);
        });

        it('should reject with GitLfsNotAvailableError if `git config --list` does not contain `filter.lfs.clean`',
            () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[0] === 'lfs') {
                    return Promise.resolve('watwat');
                } else if (executable === 'git' && args[0] === 'config' && args[1] === '--list') {
                    return Promise.resolve(
                        'filter.lfs.smudge=git-lfs smudge -- %f\n' +
                        'filter.lfs.process=git-lfs filter-process\n' +
                        'filter.lfs.required=true\n' +
                        'core.repositoryformatversion=0'
                    );
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.isGitLfsAvailable();

            return assert.isRejected(result, gitWrapper.GitLfsNotAvailableError);
        });

        it('should reject with GitLfsNotAvailableError if `git config --list` does not contain `filter.lfs.smudge`',
                () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[0] === 'lfs') {
                    return Promise.resolve('watwat');
                } else if (executable === 'git' && args[0] === 'config' && args[1] === '--list') {
                    return Promise.resolve(
                        'filter.lfs.clean=git-lfs clean -- %f\n' +
                        'filter.lfs.process=git-lfs filter-process\n' +
                        'filter.lfs.required=true\n' +
                        'core.repositoryformatversion=0'
                    );
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.isGitLfsAvailable();

            return assert.isRejected(result, gitWrapper.GitLfsNotAvailableError);
        });

        it('should reject with GitLfsNotAvailableError if `git config --list` does not contain `filter.lfs.process`',
                () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[0] === 'lfs') {
                    return Promise.resolve('watwat');
                } else if (executable === 'git' && args[0] === 'config' && args[1] === '--list') {
                    return Promise.resolve(
                        'filter.lfs.clean=git-lfs clean -- %f\n' +
                        'filter.lfs.smudge=git-lfs smudge -- %f\n' +
                        'filter.lfs.required=true\n' +
                        'core.repositoryformatversion=0'
                    );
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.isGitLfsAvailable();

            return assert.isRejected(result, gitWrapper.GitLfsNotAvailableError);
        });

        it('should fulfill with true if `git lfs` is in place and git lfs hooks are installed', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[0] === 'lfs') {
                    return Promise.resolve('watwat');
                } else if (executable === 'git' && args[0] === 'config' && args[1] === '--list') {
                    return Promise.resolve(
                        'filter.lfs.clean=git-lfs clean -- %f\n' +
                        'filter.lfs.smudge=git-lfs smudge -- %f\n' +
                        'filter.lfs.process=git-lfs filter-process\n' +
                        'filter.lfs.required=true\n' +
                        'core.repositoryformatversion=0'
                    );
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.isGitLfsAvailable();

            return assert.isFulfilled(result);
        });
    });

    describe('.olderRevision', () => {
        it('should reject with TooOldRevisionError if file doen\'t have that amount of revisions', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args.some(arg => arg === '--pretty=format:%h')) {
                    return Promise.resolve('43485c2\n8638279\n12312a\n1231241\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve(process.cwd());
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.olderRevision(process.cwd(), ['test'], 5);

            return assert.isRejected(result, gitWrapper.TooOldRevisionError);
        });

        it('should call git show with last line of git log output', done => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args.some(arg => arg === '--pretty=format:%h')) {
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve(process.cwd());
                } else if (executable === 'git' && args[1] === 'show') {
                    notifyAssert(() => {
                        assert.equal(args[2], '8638279:test');
                    }, done);

                    return Promise.resolve('ok');
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            gitWrapper.olderRevision(process.cwd(), ['test'], 2);
        });

        it('should call git show with relative filename', done => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args.some(arg => arg === '--pretty=format:%h')) {
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve(process.cwd());
                } else if (executable === 'git' && args[1] === 'show') {
                    notifyAssert(() => {
                        assert.equal(args[2], '8638279:test');
                    }, done);

                    return Promise.resolve('ok');
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            gitWrapper.olderRevision(process.cwd(), [path.join(process.cwd(), 'test')], 2);
        });

        it('should resolve with array of git show outputs', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args.some(arg => arg === '--pretty=format:%h')) {
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve(process.cwd());
                } else if (executable === 'git' && args[1] === 'show' && args[2] === '8638279:foo') {
                    return Promise.resolve('Foo once was like this.\nCan you imagine?\n');
                } else if (executable === 'git' && args[1] === 'show' && args[2] === '8638279:bar') {
                    return Promise.resolve('As a kid, bar looked like this.\n');
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.olderRevision(process.cwd(), ['foo', 'bar'], 2);
            return assert.becomes(result, [
                'Foo once was like this.\nCan you imagine?\n',
                'As a kid, bar looked like this.\n',
            ]);
        });

        it('should call git log with all files listed', done => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[1] === 'log') {
                    notifyAssert(() => {
                        assert.equal(args[4], 'test_file');
                        assert.equal(args[5], 'also_test_file');
                        assert.equal(args[6], 'foo_bar');
                    }, done);

                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve(process.cwd());
                } else if (executable === 'git' && args[1] === 'show') {
                    return Promise.resolve('this is elder file.\nShow some respect.\n');
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            gitWrapper.olderRevision(process.cwd(), ['test_file', 'also_test_file', 'foo_bar'], 2);
        });

        it('should be null-safe for filenames', done => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[1] === 'log') {
                    notifyAssert(() => {
                        assert.equal(args[4], 'test_file');
                        assert.equal(args[5], 'foo_bar');
                    }, done);
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve(process.cwd());
                } else if (executable === 'git' && args[1] === 'show') {
                    return Promise.resolve('this is elder file.\nShow some respect.\n');
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            gitWrapper.olderRevision(process.cwd(), ['test_file', null, 'foo_bar'], 2);
        });

        it('should resolve with null for null-filenames', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[1] === 'log') {
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve(process.cwd());
                } else if (executable === 'git' && args[1] === 'show') {
                    if (args[2] === '8638279:test_file') {
                        return Promise.resolve('elder test_file');
                    } else if (args[2] === '8638279:foo_bar') {
                        return Promise.resolve('elder foo_bar');
                    }
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.olderRevision(process.cwd(), ['test_file', null, 'foo_bar'], 2);

            return assert.becomes(result, ['elder test_file', null, 'elder foo_bar']);
        });

        it('should resolve correct file for not toplevel files', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[1] === 'log') {
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve(process.cwd());
                } else if (executable === 'git' && args[1] === 'show') {
                    if (args[2] === '8638279:test_dir/test_file') {
                        return Promise.resolve('elder nested test_file');
                    } else if (args[2] === '8638279:test_file') {
                        return Promise.resolve('elder toplevel foo_bar');
                    }
                }

                return Promise.reject(new Error(`mock me, bitch! executable: ${executable}, args: ${args}`));
            });

            const result = gitWrapper.olderRevision(path.join(process.cwd(), '/test_dir'), ['test_file'], 2);

            return assert.becomes(result, ['elder nested test_file']);
        });

        it('should resolve correct file for absolute file paths', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[1] === 'log') {
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return Promise.resolve('/git_root');
                } else if (executable === 'git' && args[1] === 'show') {
                    if (args[2] === '8638279:test_file') {
                        return Promise.resolve('elder foo_bar');
                    }
                }

                return Promise.reject(new Error(`mock me, bitch! executable: ${executable}, args: ${args}`));
            });

            const result = gitWrapper.olderRevision(path.join('/git_root'), ['/git_root/test_file'], 2);

            return assert.becomes(result, ['elder foo_bar']);
        });
    });

    describe('tag', () => {
        it('should throw RefAlreadyExistsError when git output shows it', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[0] === 'tag') {
                    return Promise.reject(new commandWrappers.CommandReturnedNonZeroError(
                        'Command [git tag] returned 1',
                        'fatal: tag \'veendor-32097f47c59765895b8b9d2002fe40ddc0de38bf-linux\' already exists'
                    ));
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.tag(process.cwd(), 'veendor-e00d8185b0bdb7f25d89e79ed779d0b6809bfcd0-linux');

            return assert.isRejected(result, gitWrapper.RefAlreadyExistsError);
        });
    });

    describe('push', () => {
        it('should throw RefAlreadyExistsError when git output shows it', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[0] === 'push') {
                    return Promise.reject(new commandWrappers.CommandReturnedNonZeroError(
                        'Command [git push] returned 1',
                        'HEAD is now at 7b3abff Initial commit\n' +
                        'Git LFS: (1 of 1 files) 47.46 MB / 47.46 MB\n' +
                        'To git@github.com:mutantcornholio/veendor-cache.git\n' +
                        ' ! [rejected]        veendor-e00d8185b0bdb7f25d89e79ed779d0b6809bfcd0-linux' +
                        ' -> veendor-e00d8185b0bdb7f25d89e79ed779d0b6809bfcd0-linux (already exists)\n' +
                        'error: failed to push some refs to \'git@github.yandex-team.ru:market/veendor-cache.git\'\n' +
                        'hint: Updates were rejected because the tag already exists in the remote.'
                    ));
                }

                if (executable === 'git' && args[0] === 'remote') {
                    return Promise.resolve('origin');
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.push(process.cwd(), 'veendor-e00d8185b0bdb7f25d89e79ed779d0b6809bfcd0-linux');

            return assert.isRejected(result, gitWrapper.RefAlreadyExistsError);
        });

        it('should throw RefAlreadyExistsError when git responds with cannot lock ref...reference already exists error',
            () => {
                sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                    if (executable === 'git' && args[0] === 'push') {
                        return Promise.reject(new commandWrappers.CommandReturnedNonZeroError(
                            'Command [git push] returned 1',
                            'HEAD is now at 7b3abff Initial commit\n' +
                            'Git LFS: (1 of 1 files) 47.46 MB / 47.46 MB\n' +
                            'To git@github.com:mutantcornholio/veendor-cache.git\n' +
                            ' ! [remote rejected]        veendor-e00d8185b0bdb7f25d89e79ed779d0b6809bfcd0-linux' +
                            ' -> veendor-e00d8185b0bdb7f25d89e79ed779d0b6809bfcd0-linux (cannot lock ref ' +
                            '\'refs/tags/veendor-3bc8fa1e3e22364e13220fef900aea2d19699c23-linux-48\': ' +
                            'reference already exists)\n' +
                            'error: failed to push some refs to ' +
                            '\'git@github.yandex-team.ru:market/veendor-cache.git\''
                        ));
                    }

                    if (executable === 'git' && args[0] === 'remote') {
                        return Promise.resolve('origin');
                    }

                    return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
                });

                const result = gitWrapper.push(process.cwd(), 'veendor-e00d8185b0bdb7f25d89e79ed779d0b6809bfcd0-linux');

                return assert.isRejected(result, gitWrapper.RefAlreadyExistsError);
            });
        
        it('should throw original generic error from git', () => {
            sandbox.stub(commandWrappers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args[0] === 'push') {
                    return Promise.reject(new AnError('test'));
                }

                if (executable === 'git' && args[0] === 'remote') {
                    return Promise.resolve('origin');
                }

                return Promise.reject(new Error(`mock me, bitch! args: ${args}`));
            });

            const result = gitWrapper.push(process.cwd(), 'veendor-e00d8185b0bdb7f25d89e79ed779d0b6809bfcd0-linux');

            return assert.isRejected(result, AnError);
        });
    });
});
