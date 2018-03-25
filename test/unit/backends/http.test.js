const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const nock = require('nock');
const path = require('path');
const fsExtra = require('fs-extra');
const stream = require('stream');

const assert = chai.assert;
chai.use(chaiAsPromised);

const httpBackend = require('../../../lib/backends/http');
const tarWrapper = require('../../../lib/commandWrappers/tarWrapper');
const errors = require('../../../lib/errors');
const {checkMockResult, checkNock, expectCalls} = require('../helpers');

let sandbox;
let fakeHash;
let defaultOptions;
let mockfsConfig;
let realBundleStream;


describe('http backend', () => {
    beforeEach(() => {
        fakeHash = '1234567890deadbeef1234567890';

        mockfsConfig = {
            '.veendor': {
                'http': {}
            },
        };

        mockfs(mockfsConfig);

        sandbox = sinon.sandbox.create();
        sandbox.stub(tarWrapper, 'createArchive').resolves();
        sandbox.stub(tarWrapper, 'extractArchive').resolves();

        defaultOptions = {
            resolveUrl: bundleId => `http://testhost.wat/${bundleId}.tar.gz`,
            compression: 'gzip',
            strict: false,
        };

        nock.disableNetConnect();
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
        nock.restore();
        nock.activate();
    });

    describe('pull', () => {
        it('should call `resolveUrl` function', done => {
            const mock = sandbox.mock(defaultOptions);

            mock.expects('resolveUrl').withArgs(fakeHash);

            const checkResult = checkMockResult.bind(null, [mock], done);

            httpBackend
                .pull(fakeHash, defaultOptions, '.veendor/http')
                .then(checkResult, checkResult);
        });

        it('should call http.get with result of `resolveUrl`', done => {
            const scope = nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});

            const checkResult = checkNock.bind(null, [scope], done);

            httpBackend
                .pull(fakeHash, defaultOptions, '.veendor/http')
                .then(checkResult, checkResult);
        });

        it('should use https if `resolveUrl` returns https-url', done => {
            defaultOptions.resolveUrl = bundleId => `https://testhost.wat/${bundleId}.tar.gz`;

            const scope = nock('https://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});

            const checkResult = checkNock.bind(null, [scope], done);

            httpBackend
                .pull(fakeHash, defaultOptions, '.veendor/http')
                .then(checkResult, checkResult);
        });

        it('should call http.get with fullfilment of promise returned by `resolveUrl`', done => {
            defaultOptions.resolveUrl = bundleId => Promise.resolve(`http://testhost.wat/${bundleId}.tar.gz`);

            const scope = nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});

            const checkResult = checkNock.bind(null, [scope], done);

            httpBackend
                .pull(fakeHash, defaultOptions, '.veendor/http')
                .then(checkResult, checkResult);
        });

        it('should reject with InvalidProtocolError if url resolved is not http/https', done => {
            defaultOptions.resolveUrl = bundleId => `ftp://testhost.wat/${bundleId}.tar.gz`;

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http');
            assert.isRejected(result, httpBackend.InvalidProtocolError).notify(done);
        });

        it('should download file to temp directory', done => {
            const scope = nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});

            const checkResult = () => {
                fsExtra
                    .readFile(`.veendor/http/${fakeHash}.tar.gz`)
                    .then(buf => {
                        const res = buf.toString();
                        assert.equal(res, 'wertyuiopasdfghj');
                    })
                    .then(done, done);

            };

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http');
            result.then(checkResult, checkResult);
        });

        it('should reject with BundleNotFoundError on 404', done => {
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(404);

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http');
            assert.isRejected(result, errors.BundleNotFoundError).notify(done);
        });

        it('should reject with BundleNotFoundError on non-200 if not in strict mode', done => {
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(502);

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http');
            assert.isRejected(result, errors.BundleNotFoundError).notify(done);
        });

        it('should reject with InvalidStatusCodeError on non-200 if in strict mode', done => {
            defaultOptions.strict = true;
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(502);

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http');
            assert.isRejected(result, httpBackend.InvalidStatusCodeError).notify(done);
        });

        it('should reject with BundleNotFoundError on stream fail if not in strict mode', done => {
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, new FailingStream(), {'Content-Type': 'application/x-gzip'});

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http');
            assert.isRejected(result, errors.BundleNotFoundError).notify(done);
        });

        it('should reject with BundleDownloadError on stream fail if in strict mode', done => {
            defaultOptions.strict = true;
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, new FailingStream(), {'Content-Type': 'application/x-gzip'});

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http');
            assert.isRejected(result, httpBackend.BundleDownloadError).notify(done);
        });

        it('should unpack archive to pwd', done => {
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});

            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.extractArchive,
                args: [sinon.match(`.veendor/http/${fakeHash}.tar.gz`)]
            }], done);

            // const checkResult = checkMockResult([tarWrapperMock], done);

            httpBackend.pull(fakeHash, defaultOptions, '.veendor/http').then(checkResult, checkResult);
        });
    });

    describe('validateOptions', () => {
        it('checks valid compression', () => {
            defaultOptions.compression = 'lsda';

            assert.throws(() => {
                httpBackend.validateOptions(defaultOptions);
            }, errors.InvalidOptionsError)
        });

        it('sets default compression type to `gzip`', () => {
            delete defaultOptions.compression;

            httpBackend.validateOptions(defaultOptions);

            assert.equal(defaultOptions.compression, 'gzip');
        });

        it('sets strict option to `false`', () => {
            delete defaultOptions.strict;

            httpBackend.validateOptions(defaultOptions);

            assert.equal(defaultOptions.strict, false);
        });

        it('should throw InvalidOptionsError if resolveUrl option is not provided', () => {
            delete defaultOptions.resolveUrl;
            assert.throws(() => {
                httpBackend.validateOptions(defaultOptions);
            }, errors.InvalidOptionsError)
        });
    });
});

class FailingStream extends stream.Readable {
    constructor() {
        super();
        this.turn = 0;
    }
    _read() {
        if (this.turn < 5) {
            this.turn++;
            setImmediate(() => {
                this.push('wertyuiopasdfghjk');
            });
        } else {
            this.emit('error', new Error('read error'));
            this.push(null);
        }
    }
}
