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
        fakeRepo = 'git://fakehub.com/test/test.git';
        fakeHash = '1234567890deadbeef1234567890';
        sandbox = sinon.sandbox.create();

        defaultOptions = {
            repo: fakeRepo,
            compression: 'gzip'
        };

        sandbox.stub(gitWrapper, 'clone').resolves();
        sandbox.stub(gitWrapper, 'fetch').resolves();
        sandbox.stub(gitWrapper, 'checkout').resolves();
        sandbox.stub(tarWrapper, 'createArchive').resolves();
        sandbox.stub(tarWrapper, 'extractArchive').resolves();
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    describe('.pull', () => {
        it('clones repo to cache directory if isn\'t already there', done => {
            mockfs({
                '.veendor': {
                    'git-lfs.0': {}
                },
            });

            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.clone,
                args: [fakeRepo, sinon.match('.veendor/git-lfs.0/repo')]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
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

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('checks out tag by passed hash', done => {
            mockfs({
                '.veendor': {
                    'git-lfs.0': {}
                },
            });

            const checkResult = expectCalls.bind(null, [{
                spy: gitWrapper.checkout,
                args: [sinon.match('.veendor/git-lfs.0/repo'), 'veendor-' + fakeHash]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });

        it('rejects with BundleNotFoundError if tag not found', done => {
            mockfs({
                '.veendor': {
                    'git-lfs.0': {}
                },
            });

            gitWrapper.checkout.restore();
            sandbox.stub(gitWrapper, 'checkout').rejects(new Error);

            assert
                .isRejected(gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0'), errors.BundleNotFoundError)
                .notify(done);
        });

        it('unpacks the archive to $(pwd)', done => {
            mockfs({
                '.veendor': {
                    'git-lfs.0': {}
                },
            });

            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.extractArchive,
                args: [sinon.match(`.veendor/git-lfs.0/repo/${fakeHash}.tar.gz`)]
            }], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });
    });

    describe('.push', () => {
        xit('clones repo to cache directory if isn\'t already there');
        xit('runs `fetch` if repo already exist');
        xit('checks out `master`');
        xit('archives node_modules');
        xit('creates commit');
        xit('creates tag with hash name');
        xit('pushes tag');
        xit('resets ');
    });
});

function expectCalls(expectPairs, done) {
    for (const expect of expectPairs) {
        if (!expect.spy.calledWith(...expect.args)) {
            return done(new Error(`Expected spy "${expect.spy.displayName}" to be called with ${expect.args}\n` +
            `Actual calls were: [${expect.spy.getCalls().join(', ')}]`))
        }
    }

    done();
}
