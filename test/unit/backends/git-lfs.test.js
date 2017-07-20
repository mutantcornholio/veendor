const {describe, it, beforeEach, afterEach} = require('mocha');
const assert = require('chai').assert;
const sinon = require('sinon');
const mockfs = require('mock-fs');

const gitLfs = require('../../../lib/backends/git-lfs');
const gitWrapper = require('../../../lib/commandWrappers/gitWrapper');

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
            repo: fakeRepo
        }
    });

    describe('.pull', () => {
        it('clones repo to cache directory if isn\'t already there', done => {
            mockfs({
                '.veendor': {
                    'git-lfs.0': {}
                },
            });

            const gitWrapperMock = sandbox.mock(gitWrapper)
                .expects('clone').withArgs(fakeRepo, sinon.match('.veendor/git-lfs.0/repo'))
                .resolves();

            const checkResult = checkMockResult.bind(null, [gitWrapperMock], done);

            gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').then(checkResult, checkResult);
        });
        xit('runs `fetch` if repo already exist');
        xit('checks out tag by passed hash');
        xit('throws BundleNotFoundError if tag not found');
        xit('decompresses the archive');
        xit('unpacks the archive to $(pwd)/node_modules');
        xit('cleans decompressed archive');
    });

    describe('.push', () => {
        xit('clones repo to cache directory if isn\'t already there');
        xit('runs `fetch` if repo already exist');
        xit('checks out `master`');
        xit('archives node_modules');
        xit('compresses archive and places it into repo root');
        xit('creates commit');
        xit('creates tag with hash name');
        xit('pushes tag');
        xit('resets ');
        xit('cleans up uncompressed archive');
    });
});

function checkMockResult(mocks, done) {
    try {
        mocks.map(mock => mock.verify());
    } catch (error) {
        return done(error);
    }

    done();
}
