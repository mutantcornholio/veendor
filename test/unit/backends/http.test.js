const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const nock = require('nock');
const fsExtra = require('fs-extra');

const assert = chai.assert;
chai.use(chaiAsPromised);

const httpBackend = require('../../../lib/backends/http');
const tarWrapper = require('../../../lib/commandWrappers/tarWrapper');
const errors = require('../../../lib/errors');
const {
    checkMockResult,
    checkNock,
    expectCalls,
    SuccessfulStream,
    FailingStream,
    fakeExtractArchiveFromStream,
} = require('../helpers');

let sandbox;
let fakeHash;
let defaultOptions;
let mockfsConfig;
let tarWrapperCreateArchiveStub;
let tarWrapperExctractArchiveFromStreamStub;


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

        tarWrapperCreateArchiveStub = sandbox
            .stub(tarWrapper, 'createArchive')
            .callsFake(outPath => {
                fs.writeFileSync(outPath, '');
                return Promise.resolve();
            });

        tarWrapperExctractArchiveFromStreamStub = sandbox
            .stub(tarWrapper, 'extractArchiveFromStream')
            .callsFake(fakeExtractArchiveFromStream);

        defaultOptions = {
            resolveUrl: bundleId => `http://testhost.wat/${bundleId}.tar.gz`,
            compression: 'gzip',
            strict: false,
        };

        if (!nock.isActive()) {
            nock.activate();
        }

        nock.disableNetConnect();
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
        nock.restore();
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

        it('should pipe response stream to tar', () => {
            const bundleStream = new SuccessfulStream();

            tarWrapperExctractArchiveFromStreamStub.restore();
            const tarWrapperMock = sandbox.mock(tarWrapper)
                .expects('extractArchiveFromStream')
                .callsFake(stream => fakeExtractArchiveFromStream(stream)
                    .then(chunks => {
                        assert.equal(chunks[0], ('wertyuiopasdfghjk').repeat(5));
                    }));

            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, bundleStream, {'Content-Type': 'application/x-gzip'});

            return httpBackend.pull(fakeHash, defaultOptions, '.veendor/http')
                .then(() => tarWrapperMock.verify());
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
