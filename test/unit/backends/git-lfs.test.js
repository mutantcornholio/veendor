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
const errors = require('../../../lib/backends/errors');

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

        sandbox.stub(gitWrapper, 'clone').resolves();
        sandbox.stub(gitWrapper, 'fetch').resolves();
        sandbox.stub(gitWrapper, 'checkout').resolves();
        sandbox.stub(gitWrapper, 'add').resolves();
        sandbox.stub(gitWrapper, 'commit').resolves();
        sandbox.stub(gitWrapper, 'tag').resolves();
        sandbox.stub(gitWrapper, 'push').resolves();
        sandbox.stub(tarWrapper, 'createArchive').resolves();
        sandbox.stub(tarWrapper, 'extractArchive').resolves();
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    describe('.pull', () => {
        it('clones repo to cache directory if isn\'t already there', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.clone,
                args: [fakeRepo, sinon.match('.veendor/git-lfs.0/repo')]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        // FIXME: use isGitRepo here
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

        xit('if clone fails, should reject with BackendError');
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

    describe('.validateOptions', () => {
        it('throws error if `repo` hasn\'t been passed', () => {
            delete defaultOptions.repo;

            assert.throws(() => {
                gitLfs.validateOptions(defaultOptions);
            }, errors.InvalidOptionsError)
        });

        it('checks valid compression', () => {
            defaultOptions.compression = 'lsda';

            assert.throws(() => {
                gitLfs.validateOptions(defaultOptions);
            }, errors.InvalidOptionsError)
        });

        it('sets default compression type to `gzip`', () => {
            delete defaultOptions.compression;

            gitLfs.validateOptions(defaultOptions);

            assert.equal(defaultOptions.compression, 'gzip');
        });

        it('sets default default branch to `master`', () => {
            delete defaultOptions.defaultBranch;

            gitLfs.validateOptions(defaultOptions);

            assert.equal(defaultOptions.defaultBranch, 'master');
        });
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
