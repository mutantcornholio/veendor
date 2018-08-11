const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const fsExtra = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const assert = chai.assert;
chai.use(chaiAsPromised);

const helpers = require('../helpers');

const {createCleanCacheDir} = require('@/lib/install/helpers');

const FAKE_HASH = '1234567890deadbeef1234567890';

let sandbox;
let fakeBackend;
let fakeSha1;

describe('createCleanCacheDir', () => {
    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        mockfs({});
        fakeBackend = helpers.fakeBackendConfig('fakeBackends[0]');

        fakeSha1 = {
            update: () => {},
            digest: () => FAKE_HASH,
        };

        sandbox.stub(crypto, 'createHash').returns(fakeSha1);
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    it('creates new cache dir', () => {
        return createCleanCacheDir(fakeBackend).then(dir => {
            assert(fsExtra.statSync(dir).isDirectory());
        });
    });

    it('cleans cache directory if one already exists', () => {
        return createCleanCacheDir(fakeBackend)
            .then(dir => fsExtra.writeFile(path.join(dir, 'foo'), 'bar'))
            .then(() => createCleanCacheDir(fakeBackend))
            .then(dir => assert.throws(
                () => fsExtra.statSync(path.join(dir, 'foo'), 'bar')),
                'no such file or directory'
            );
    });

    it('doesn\'t clean cache directory if backend has keepCache == true option ', () => {
        fakeBackend.backend.keepCache = true;

        return createCleanCacheDir(fakeBackend)
            .then(dir => fsExtra.writeFile(path.join(dir, 'foo'), 'bar'))
            .then(() => createCleanCacheDir(fakeBackend))
            .then(dir => assert.equal(fsExtra.readFileSync(path.join(dir, 'foo')), 'bar'));
    });

    it('creates cache directory in os.tmpdir() if can', () => {
        const tmpDir = os.tmpdir();

        return createCleanCacheDir(fakeBackend).then(dir => assert.match(dir, new RegExp(`^${tmpDir}`)));
    });

    it('contains hash of process.cwd() in tmpdir name', () => {
        return createCleanCacheDir(fakeBackend).then(dir => assert.include(dir, FAKE_HASH));
    });
});
