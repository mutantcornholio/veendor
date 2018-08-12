const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const nock = require('nock');
const fs = require('fs');
const AWS = require('aws-sdk');
const {Stream} = require('stream');

const assert = chai.assert;
chai.use(chaiAsPromised);

const s3Backend = require('@/lib/backends/s3');
const tarWrapper = require('@/lib/commandWrappers/tarWrapper');
const errors = require('@/lib/errors');
const {
    AWSError,
    AnError,
    SuccessfulStream,
    FailingStream,
    DevNullStream,
    fakeExtractArchiveFromStream,
    fakeCreateStreamArchive,
} = require('../helpers');

let sandbox;
let fakeHash;
let defaultOptions;
let mockfsConfig;
let bundleStream;
let fakeS3;
let fakeS3UploadError;
let fakeS3HeadResultPromise;
let tarWrapperCreateArchiveStub;
let tarWrapperExctractArchiveFromStreamStub;


describe('s3 backend', () => {
    before(() => {
        // AWS uses dynamic require's, so we'll populate require cache to be able to use mockfs later
        fs.readdirSync('node_modules/aws-sdk/apis')
            .filter(file => file.endsWith('.json'))
            .map(file => require(`../../../node_modules/aws-sdk/apis/${file}`));
    });
    
    beforeEach(() => {
        fakeHash = '1234567890deadbeef1234567890';

        mockfsConfig = {
            '.veendor': {
                's3': {}
            },
        };

        mockfs(mockfsConfig);

        sandbox = sinon.sandbox.create();
        bundleStream = new SuccessfulStream();

        fakeS3UploadError = null;
        fakeS3HeadResultPromise = Promise.resolve({
            AcceptRanges: 'bytes',
            LastModified: new Date(),
            ContentLength: 5552,
            ETag: '"751d74b0c8051a560243092d2d5a53df"',
            ContentType: 'application/octet-stream',
            Metadata: {},
        });

        fakeS3 = {
            getObject() {
                return {
                    createReadStream() {
                        return bundleStream;
                    }
                };
            },
            upload(params) {
                params.Body.pipe(new DevNullStream());

                return {
                    promise() {
                        return new Promise((resolve, reject) => {
                            if (fakeS3UploadError === null) {
                                params.Body.on('end', resolve());
                            } else {
                                params.Body.on('end', reject(fakeS3UploadError));
                            }
                        });
                    }
                }
            },
            headObject() {
                return {
                    promise() {
                        if (fakeS3HeadResultPromise === null) {
                            return Promise.reject(new AWSError(null, 404, 'NotFound'));
                        } else {
                            return fakeS3HeadResultPromise;
                        }
                    }
                }
            }
        };

        tarWrapperCreateArchiveStub = sandbox.stub(tarWrapper, 'createStreamArchive')
            .callsFake(fakeCreateStreamArchive);

        tarWrapperExctractArchiveFromStreamStub = sandbox.stub(tarWrapper, 'extractArchiveFromStream')
            .callsFake(fakeExtractArchiveFromStream);

        defaultOptions = {
            s3Options: {
                endpoint: 'http://localhost:12345'
            },
            bucket: 'mybucket',
            objectAcl: 'authenticated-read',
            compression: 'gzip',
            __s3: fakeS3,
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
        it('calls s3.getObject with bucket name and hash + compression as key', () => {
            const s3Mock = sandbox.mock(defaultOptions.__s3);

            s3Mock.expects('getObject').withArgs({
                Bucket: 'mybucket',
                Key: `${fakeHash}.tar.gz`,
            }).callThrough();

            return s3Backend.pull(fakeHash, defaultOptions, '.veendor/s3')
                .then(() => s3Mock.verify());
        });

        it('should pipe response stream to tar', () => {
            tarWrapperCreateArchiveStub.restore();
            tarWrapperExctractArchiveFromStreamStub.restore();
            const tarWrapperMock = sandbox.mock(tarWrapper)
                .expects('extractArchiveFromStream')
                .withArgs(sinon.match.instanceOf(Stream))
                .callsFake(fakeExtractArchiveFromStream);

            return s3Backend.pull(fakeHash, defaultOptions, '.veendor/s3')
                .then(() => tarWrapperMock.verify());
        });

        it('should reject with BundleDownloadError if stream fails', done => {
            bundleStream = new FailingStream();

            assert.isRejected(s3Backend.pull(fakeHash, defaultOptions, '.veendor/s3'), s3Backend.BundleDownloadError)
                .notify(done);
        });

        it('should reject with BundleNotFoundError if stream fails with NoSuchKey', done => {
            bundleStream = new FailingStream(new AWSError('The specified key does not exist.', 404, 'NoSuchKey'));

            assert.isRejected(s3Backend.pull(fakeHash, defaultOptions, '.veendor/s3'), errors.BundleNotFoundError)
                .notify(done);
        });
    });

    describe('push', () => {
        it('should call s3.headObject', () => {
            fakeS3HeadResultPromise = Promise.resolve({
                AcceptRanges: 'bytes',
                LastModified: new Date(),
                ContentLength: 5552,
                ETag: '"751d74b0c8051a560243092d2d5a53df"',
                ContentType: 'application/octet-stream',
                Metadata: {},
            });

            const s3Mock = sandbox.mock(defaultOptions.__s3);

            s3Mock.expects('headObject').withArgs({
                Bucket: 'mybucket',
                Key: `${fakeHash}.tar.gz`,
            }).callThrough();

            s3Mock.expects('upload').never();

            return s3Backend.push(fakeHash, defaultOptions, '.veendor/s3').catch(() => s3Mock.verify());
        });

        it('should with BundleAlreadyExistsError is object exists', done => {
            fakeS3HeadResultPromise = Promise.resolve({
                AcceptRanges: 'bytes',
                LastModified: new Date(),
                ContentLength: 5552,
                ETag: '"751d74b0c8051a560243092d2d5a53df"',
                ContentType: 'application/octet-stream',
                Metadata: {},
            });

            assert.isRejected(s3Backend.push(fakeHash, defaultOptions, '.veendor/s3'), errors.BundleAlreadyExistsError)
                .notify(done);
        });

        it('should create streamArchive and call s3.upload with it', () => {
            fakeS3HeadResultPromise = null;
            const controlToken = {};
            fakeCreateStreamArchive('node_moudles', 'gz', {controlToken});

            const s3Mock = sandbox.mock(defaultOptions.__s3);

            s3Mock.expects('upload').withArgs({
                Bucket: 'mybucket',
                Key: `${fakeHash}.tar.gz`,
                ACL: defaultOptions.objectAcl,
                Body: sinon.match.instanceOf(Stream),
            }).callThrough();

            return s3Backend.push(fakeHash, defaultOptions, '.veendor/s3').then(() => s3Mock.verify());
        });

        it('should reject with BundleUploadError if s3 upload fails', done => {
            fakeS3HeadResultPromise = null;
            fakeS3UploadError = new AnError('wat');

            assert.isRejected(s3Backend.push(fakeHash, defaultOptions, '.veendor/s3'), s3Backend.BundleUploadError)
                .notify(done);
        });
    });

    describe('validateOptions', () => {
        beforeEach(() => {
            delete defaultOptions.__s3;
        });

        it('checks valid compression', () => {
            defaultOptions.compression = 'lsda';

            assert.throws(() => {
                s3Backend.validateOptions(defaultOptions);
            }, errors.InvalidOptionsError)
        });

        it('checks valid bucket name', () => {
            delete defaultOptions.bucket;

            assert.throws(() => {
                s3Backend.validateOptions(defaultOptions);
            }, errors.InvalidOptionsError)
        });

        it('sets default compression type to `gzip`', () => {
            delete defaultOptions.compression;

            s3Backend.validateOptions(defaultOptions);

            assert.equal(defaultOptions.compression, 'gzip');
        });

        it('sets default objectACL to `public-read`', () => {
            delete defaultOptions.objectAcl;

            s3Backend.validateOptions(defaultOptions);

            assert.equal(defaultOptions.objectAcl, 'public-read');
        });

        it('creates s3Options object, if not passed', () => {
            delete defaultOptions.s3Options;

            s3Backend.validateOptions(defaultOptions);

            assert.isObject(defaultOptions.s3Options);
        });

        it('creates AWS instance with passed AWS options and fixed API version', () => {
            const awsMock = sandbox.mock(AWS);
            defaultOptions.s3Options = {
                foo: 'bar',
            };

            awsMock.expects('S3').withArgs({
                foo: 'bar',
                apiVersion: '2006-03-01',
            }).returns(fakeS3);

            s3Backend.validateOptions(defaultOptions);

            awsMock.verify();
            assert.equal(defaultOptions.__s3, fakeS3);
        });
    });
});
