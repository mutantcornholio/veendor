import {afterEach, beforeEach, describe, it} from 'mocha';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import mockfs from 'mock-fs';
import fs from 'fs-extra';
import nock from 'nock';
import * as httpBackend from '@/lib/backends/http';
import * as tarWrapper from '@/lib/commandWrappers/tarWrapper';
import * as errors from '@/lib/errors';
import {
    makeFakeBackendToolsProvider,
    SuccessfulStream,
    FailingStream,
    fakeExtractArchiveFromStream,
} from '../helpers';
import {HttpOptions} from '@/lib/backends/http';

const assert = chai.assert;
chai.use(chaiAsPromised);

let sandbox: sinon.SinonSandbox;
let fakeHash: string;
let defaultOptions: HttpOptions;
let mockfsConfig;


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

        sandbox
            .stub(tarWrapper, 'createArchive')
            .callsFake((outPath: string, _paths: string[], _compression: string) => {
                fs.writeFileSync(outPath, '');
                return Promise.resolve('');
            });

        sandbox
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
        it('should call `resolveUrl` function', async () => {
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});
            const mock = sandbox.mock(defaultOptions);

            mock.expects('resolveUrl').withArgs(fakeHash).callThrough();

            await httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            mock.verify();
        });

        it('should call http.get with result of `resolveUrl`', async () => {
            const scope = nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});

            await httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            scope.done();
        });

        it('should use https if `resolveUrl` returns https-url', async () => {
            defaultOptions.resolveUrl = bundleId => `https://testhost.wat/${bundleId}.tar.gz`;

            const scope = nock('https://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});

            await httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            scope.done();
        });

        it('should call http.get with fullfilment of promise returned by `resolveUrl`', async () => {
            defaultOptions.resolveUrl = bundleId => Promise.resolve(`http://testhost.wat/${bundleId}.tar.gz`);

            const scope = nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, 'wertyuiopasdfghj', {'Content-Type': 'application/x-gzip'});

            await httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            scope.done();
        });

        it('should reject with InvalidProtocolError if url resolved is not http/https', () => {
            defaultOptions.resolveUrl = bundleId => `ftp://testhost.wat/${bundleId}.tar.gz`;

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            return assert.isRejected(result, httpBackend.InvalidProtocolError);
        });

        it('should pipe response stream to tar', () => {
            const bundleStream = new SuccessfulStream();

            // @ts-ignore
            tarWrapper.extractArchiveFromStream.restore();
            const tarWrapperMock = sandbox.mock(tarWrapper);
            tarWrapperMock.expects('extractArchiveFromStream')
                .callsFake(stream => fakeExtractArchiveFromStream(stream)
                    .then(result => {
                        assert.equal(result, ('wertyuiopasdfghjk').repeat(5));
                    }));

            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, bundleStream, {'Content-Type': 'application/x-gzip'});

            return httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider())
                .then(() => tarWrapperMock.verify());
        });

        it('should reject with BundleNotFoundError on 404', () => {
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(404);

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            return assert.isRejected(result, errors.BundleNotFoundError);
        });

        it('should reject with BundleNotFoundError on non-200 if not in strict mode', () => {
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(502);

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            return assert.isRejected(result, errors.BundleNotFoundError);
        });

        it('should reject with InvalidStatusCodeError on non-200 if in strict mode', () => {
            defaultOptions.strict = true;
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(502);

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            return assert.isRejected(result, httpBackend.InvalidStatusCodeError);
        });

        it('should reject with BundleNotFoundError on stream fail if not in strict mode', () => {
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, new FailingStream(), {'Content-Type': 'application/x-gzip'});

            const result = httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider());
            return assert.isRejected(result, errors.BundleNotFoundError);
        });

        it('should reject with BundleDownloadError on stream fail if in strict mode', () => {
            defaultOptions.strict = true;
            nock('http://testhost.wat')
                .get(`/${fakeHash}.tar.gz`)
                .reply(200, new FailingStream(), {'Content-Type': 'application/x-gzip'});

            return assert.isRejected(
                httpBackend.pull(fakeHash, defaultOptions, '.veendor/http', makeFakeBackendToolsProvider()),
                httpBackend.BundleDownloadError
            );
        });
    });

    describe('validateOptions', () => {
        it('checks valid compression', () => {
            // @ts-ignore
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
