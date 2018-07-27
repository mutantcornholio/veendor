const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const fsExtra = require('fs-extra');
const path = require('path');
const _ = require('lodash');

const assert = chai.assert;
chai.use(chaiAsPromised);

const helpers = require('../helpers');

const {createCleanCacheDir} = require('../../../lib/install/helpers');

let sandbox;
let fakeBackend;

describe('createCleanCacheDir', () => {
    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        mockfs({});
        fakeBackend = helpers.fakeBackendConfig('fakeBackends[0]');
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    it('creates new cache dir', () => {
        return createCleanCacheDir(fakeBackend).then(dir => {
            console.log('\n\n\n', dir, '\n\n\n');
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

    xit('creates cache directory in os.tmpdir() if can', () => {

    });

    xit('contains hash of process.cwd() in tmpdir name', () => {

    });

    xit('creates cache directory in process.cwd()/.veendor if can\'t create it in os.tmpdir()', () => {

    });
});
