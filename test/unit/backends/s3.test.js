const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const nock = require('nock');
const fs = require('fs');
const AWS = require('aws-sdk');

const assert = chai.assert;
chai.use(chaiAsPromised);

const s3Backend = require('../../../lib/backends/s3');
const tarWrapper = require('../../../lib/commandWrappers/tarWrapper');
const errors = require('../../../lib/errors');
const {
    checkMockResult,
    AWSError,
    AnError,
    expectCalls,
    SuccessfulStream,
    FailingStream,
    DevNullStream,
} = require('../helpers');

let sandbox;
let fakeHash;
let defaultOptions;
let mockfsConfig;
let bundleStream;
let fakeS3;
let fakeS3UploadError;
let fakeS3HeadResultPromise;


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
        fakeS3HeadResultPromise = null;
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

        sandbox.stub(tarWrapper, 'createArchive').callsFake(outPath => {
            fs.writeFileSync(outPath, '');
            return Promise.resolve();
        });
        sandbox.stub(tarWrapper, 'extractArchive').resolves();

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
        it('calls s3.getObject with bucket name and hash + compression as key', done => {
            const s3Mock = sandbox.mock(defaultOptions.__s3);

            s3Mock.expects('getObject').withArgs({
                Bucket: 'mybucket',
                Key: `${fakeHash}.tar.gz`,
            }).callThrough();

            const checkResult = checkMockResult.bind(null, [s3Mock], done);

            s3Backend.pull(fakeHash, defaultOptions, '.veendor/s3').then(checkResult, checkResult);
        });

        it('should pipe response stream to file', done => {
            const writeStream = fs.createWriteStream(`.veendor/s3/${fakeHash}.tar.gz`);
            const fsMock = sandbox.mock(fs);

            fsMock
                .expects('createWriteStream')
                .withArgs(`.veendor/s3/${fakeHash}.tar.gz`)
                .returns(writeStream);

            const streamMock = sandbox.mock(bundleStream);

            streamMock.expects('pipe').withArgs(writeStream).callThrough();

            const checkResult = checkMockResult.bind(null, [fsMock, streamMock], done);

            s3Backend.pull(fakeHash, defaultOptions, '.veendor/s3').then(checkResult, checkResult);
        });

        it('should pipe response stream to file', done => {
            const writeStream = fs.createWriteStream(`.veendor/s3/${fakeHash}.tar.gz`);
            const fsMock = sandbox.mock(fs);

            fsMock
                .expects('createWriteStream')
                .withArgs(`.veendor/s3/${fakeHash}.tar.gz`)
                .returns(writeStream);

            const streamMock = sandbox.mock(bundleStream);

            streamMock.expects('pipe').withArgs(writeStream).callThrough();

            const checkResult = checkMockResult.bind(null, [fsMock, streamMock], done);

            s3Backend.pull(fakeHash, defaultOptions, '.veendor/s3').then(checkResult, checkResult);
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

        it('should unpack archive to pwd', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.extractArchive,
                args: [sinon.match(`.veendor/s3/${fakeHash}.tar.gz`)]
            }], done);

            s3Backend.pull(fakeHash, defaultOptions, '.veendor/s3').then(checkResult, checkResult);
        });
    });

    describe('push', () => {
        it('should pack node_modules to cache directory', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.createArchive,
                args: [
                    sinon.match(`.veendor/s3/${fakeHash}.tar.gz`),
                    [sinon.match('node_modules')],
                    defaultOptions.compression
                ]
            }], done);

            s3Backend.push(fakeHash, defaultOptions, '.veendor/s3').then(checkResult, checkResult);
        });

        it('should call s3.headObject', done => {
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

            const checkResult = checkMockResult.bind(null, [s3Mock], done);

            s3Backend.push(fakeHash, defaultOptions, '.veendor/s3').then(checkResult, checkResult);
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

        it('should call s3.upload with readable stream from archive', done => {
            const readStream = new SuccessfulStream();
            const fsMock = sandbox.mock(fs);

            fsMock
                .expects('createReadStream')
                .withArgs(`.veendor/s3/${fakeHash}.tar.gz`)
                .returns(readStream);

            const s3Mock = sandbox.mock(defaultOptions.__s3);

            s3Mock.expects('upload').withArgs({
                Bucket: 'mybucket',
                Key: `${fakeHash}.tar.gz`,
                ACL: defaultOptions.objectAcl,
                Body: readStream,
            }).callThrough();

            const checkResult = checkMockResult.bind(null, [fsMock, s3Mock], done);

            s3Backend.push(fakeHash, defaultOptions, '.veendor/s3').then(checkResult, checkResult);
        });

        it('should reject with BundleUploadError if s3 upload fails', done => {
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
