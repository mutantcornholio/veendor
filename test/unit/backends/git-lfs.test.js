const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const path = require('path');

const assert = chai.assert;
chai.use(chaiAsPromised);

const gitLfs = require('../../../lib/backends/git-lfs');
const gitWrapper = require('../../../lib/commandWrappers/gitWrapper');
const tarWrapper = require('../../../lib/commandWrappers/tarWrapper');
const errors = require('../../../lib/errors');

const {notifyAssert} = require('../helpers');

let fakeRepo;
let sandbox;
let fakeHash;
let defaultOptions;

describe('git-lfs', () => {
    beforeEach(() => {
        mockfs({
            '.veendor': {
                'git-lfs.0': {}
            },
        });

        fakeRepo = 'git://fakehub.com/test/test.git';
        fakeHash = '1234567890deadbeef1234567890';
        sandbox = sinon.sandbox.create();

        defaultOptions = {
            repo: fakeRepo,
            compression: 'gzip',
            defaultBranch: 'defaultBranchaster'
        };

        gitLfs._remoteIsFresh = false;

        sandbox.stub(gitWrapper, 'clone').resolves();
        sandbox.stub(gitWrapper, 'fetch').resolves();
        sandbox.stub(gitWrapper, 'checkout').resolves();
        sandbox.stub(gitWrapper, 'add').resolves();
        sandbox.stub(gitWrapper, 'commit').resolves();
        sandbox.stub(gitWrapper, 'tag').resolves();
        sandbox.stub(gitWrapper, 'push').resolves();
        sandbox.stub(gitWrapper, 'isGitRepo').resolves();
        sandbox.stub(gitWrapper, 'resetToRemote').resolves();
        sandbox.stub(gitWrapper, 'isGitLfsAvailable').resolves();
        sandbox.stub(gitWrapper, 'lfsPull').resolves();
        sandbox.stub(tarWrapper, 'createArchive').resolves();
        sandbox.stub(tarWrapper, 'extractArchive').resolves();
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    describe('.pull', () => {
        it('clones repo to cache directory if isn\'t already there', done => {
            gitWrapper.isGitRepo.restore();
            sandbox.stub(gitWrapper, 'isGitRepo').rejects(gitWrapper.NotAGitRepoError);

            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.clone,
                args: [fakeRepo, sinon.match('.veendor/git-lfs.0/repo')]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('runs `fetch` if repo already exist', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.fetch,
                args: [sinon.match('.veendor/git-lfs.0/repo')]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('checks out tag by passed hash', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.checkout,
                args: [sinon.match('.veendor/git-lfs.0/repo'), 'veendor-' + fakeHash]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('rejects with BundleNotFoundError if tag not found', done => {
            gitWrapper.checkout.restore();
            sandbox.stub(gitWrapper, 'checkout').rejects(new Error);

            assert
                .isRejected(gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0'), errors.BundleNotFoundError)
                .notify(done);
        });

        it('unpacks the archive to $(pwd)', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.extractArchive,
                args: [sinon.match(`.veendor/git-lfs.0/repo/${fakeHash}.tar.gz`)]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('should run git fetch only once in a run', done => {
            const checkResult = () => {
                const calls = gitWrapper.fetch.getCalls();
                notifyAssert(assert.equal.bind(
                    null,
                    calls.length,
                    1,
                    `Expected 'gitWrapper.fetch' to be called once`
                ), done);
            };

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0')
                .then(() => {
                    return gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');
                })
                .then(() => {
                    return gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');
                })
                .then(checkResult, checkResult);
        });

        it('should run git lfs pull if git lfs is available', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.lfsPull,
                args: [sinon.match('.veendor/git-lfs.0/repo')]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('should not run git lfs pull if git lfs is not available', done => {
            gitWrapper.isGitLfsAvailable.restore();
            sandbox.stub(gitWrapper, 'isGitLfsAvailable').rejects(new gitWrapper.GitLfsNotAvailableError);

            const checkResult = () => {
                const calls = gitWrapper.lfsPull.getCalls();
                notifyAssert(assert.equal.bind(
                    null,
                    calls.length,
                    0,
                    `Expected 'gitWrapper.lfsPull' not to be called`
                ), done);
            };

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });
    });

    describe('.push', () => {
        it('clones repo to cache directory if isn\'t already there', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.clone,
                args: [fakeRepo, sinon.match('.veendor/git-lfs.0/repo')]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);

        });

        it('runs `fetch` if repo already exist', done => {
            mockfs({
                '.veendor': {
                    'git-lfs.0': {
                        repo: {
                            '.git': {}
                        }
                    }
                },
            });

            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.fetch,
                args: [sinon.match('.veendor/git-lfs.0/repo')]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('checks out default branch', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.checkout,
                args: [sinon.match('.veendor/git-lfs.0/repo'), defaultOptions.defaultBranch]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('resets branch to remote state', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.resetToRemote,
                args: [sinon.match('.veendor/git-lfs.0/repo'), defaultOptions.defaultBranch]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('archives node_modules', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.createArchive,
                args: [
                    sinon.match(`.veendor/git-lfs.0/repo/${fakeHash}`),
                    [path.resolve(process.cwd(), 'node_modules')],
                    defaultOptions.compression
                ]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('adds archive to staging', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.add,
                args: [
                    sinon.match('.veendor/git-lfs.0/repo'),
                    [sinon.match(`.veendor/git-lfs.0/repo/${fakeHash}.tar.gz`)]
                ]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('creates commit', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.commit,
                args: [sinon.match('.veendor/git-lfs.0/repo'), sinon.match.any]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('creates tag with hash name', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.tag,
                args: [sinon.match('.veendor/git-lfs.0/repo'), `veendor-${fakeHash}`]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('pushes tag', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.push,
                args: [sinon.match('.veendor/git-lfs.0/repo'), `veendor-${fakeHash}`]
            }], done);

            gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });
    });

    describe('.validateOptions', done => {
        it('throws error if `repo` hasn\'t been passed', done => {
            delete defaultOptions.repo;

            assert.isRejected(gitLfs.validateOptions(defaultOptions), errors.InvalidOptionsError).notify(done);
        });

        it('checks valid compression', done => {
            defaultOptions.compression = 'lsda';

            assert.isRejected(gitLfs.validateOptions(defaultOptions), errors.InvalidOptionsError).notify(done);
        });

        it('sets default compression type to `gzip`', done => {
            delete defaultOptions.compression;

            gitLfs
                .validateOptions(defaultOptions)
                .then(() => {
                    assert.equal(defaultOptions.compression, 'gzip');
                    done();
                }, done);
        });

        it('sets default default branch to `master`', done => {
            delete defaultOptions.defaultBranch;

            gitLfs
                .validateOptions(defaultOptions)
                .then(() => {
                    notifyAssert(assert.equal.bind(null, defaultOptions.defaultBranch, 'master'), done);
                }, done);
        });

        it('checks if checkLfsAvailability is boolean', done => {
            defaultOptions.checkLfsAvailability = 'test';

            assert.isRejected(gitLfs.validateOptions(defaultOptions), errors.InvalidOptionsError).notify(done);
        });

        it('sets default checkLfsAvailability to `false`', done => {
            gitLfs
                .validateOptions(defaultOptions)
                .then(() => {
                    notifyAssert(assert.equal.bind(null, defaultOptions.checkLfsAvailability, false), done);
                }, done);
        });

        it('rejects with `GitLfsNotAvailableError` if git lfs is not available ' +
            'and `checkLfsAvailability` was set to \'true\'', done => {
            defaultOptions.checkLfsAvailability = true;

            gitWrapper.isGitLfsAvailable.restore();
            sandbox.stub(gitWrapper, 'isGitLfsAvailable').rejects(new gitWrapper.GitLfsNotAvailableError);

            assert.isRejected(gitLfs.validateOptions(defaultOptions), gitWrapper.GitLfsNotAvailableError).notify(done);
        })
    })
});

function expectCalls(expectPairs, done) {
    for (const expect of expectPairs) {
        if (!expect.spy.calledWith(...expect.args)) {
            return done(new Error(`Expected spy "${expect.spy.displayName}" ` +
                `to be called with [${expect.args.join(', ')}]\n` +
                `Actual calls were: [${expect.spy.getCalls().join(', ')}]`))
        }
    }

    done();
}
