import {afterEach, beforeEach, describe, it} from 'mocha';


import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import mockfs from 'mock-fs';
import * as local from '@/lib/backends/local';
import * as tarWrapper from '@/lib/commandWrappers/tarWrapper';
import * as errors from '@/lib/errors';

const assert = chai.assert;
chai.use(chaiAsPromised);
let sandbox: sinon.SinonSandbox;
let fakeHash: string;
let defaultOptions: local.LocalOptions;
let mockfsConfig: {[key: string]: {} | string};

describe('local', () => {
    beforeEach(() => {
        fakeHash = '1234567890deadbeef1234567890';

        mockfsConfig = {
            '.veendor': {
                'local': {}
            },
            'target': {}
        };

        mockfsConfig[`target/${fakeHash}.tar.gz`] = 'somestuff';

        mockfs(mockfsConfig);

        sandbox = sinon.sandbox.create();
        sandbox.stub(tarWrapper, 'createArchive').resolves();
        sandbox.stub(tarWrapper, 'extractArchive').resolves();

        defaultOptions = {
            directory: 'target',
            compression: 'gzip'
        };
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    describe('pull', () => {
        it('should unpack archive to pwd', async () => {
            // @ts-ignore
            tarWrapper.extractArchive.restore();
            const mock = sinon.mock(tarWrapper);
            mock.expects('extractArchive').withArgs(sinon.match(`target/${fakeHash}.tar.gz`)).resolves('');

            await local.pull(fakeHash, defaultOptions);
            mock.verify();
        });

        it('should respect desired compression', async () => {
            defaultOptions.compression = 'xz';
            mockfsConfig[`target/${fakeHash}.tar.xz`] = 'somestuff';
            mockfs(mockfsConfig);

            // @ts-ignore
            tarWrapper.extractArchive.restore();
            const mock = sinon.mock(tarWrapper);
            mock.expects('extractArchive').withArgs(sinon.match(`target/${fakeHash}.tar.xz`)).resolves('');

            await local.pull(fakeHash, defaultOptions);
            mock.verify();
        });

        it('should not call tar if archive is not in target directory', async () => {
            delete mockfsConfig[`target/${fakeHash}.tar.gz`];
            mockfs(mockfsConfig);

            // @ts-ignore
            tarWrapper.extractArchive.restore();
            const mock = sinon.mock(tarWrapper);
            mock.expects('extractArchive').never();

            await local.pull(fakeHash, defaultOptions).catch(() => {});
            mock.verify();
        });

        it('should reject with \'BundleNotFoundError\' if archive is not in target directory', () => {
            delete mockfsConfig[`target/${fakeHash}.tar.gz`];
            mockfs(mockfsConfig);

            return assert.isRejected(local.pull(fakeHash, defaultOptions), errors.BundleNotFoundError);
        });
    });

    describe('push', () => {
        it('should pack node_modules to target directory', async () => {
            delete mockfsConfig[`target/${fakeHash}.tar.gz`];
            mockfs(mockfsConfig);

            // @ts-ignore
            tarWrapper.createArchive.restore();
            const mock = sinon.mock(tarWrapper);

            mock.expects('createArchive').withArgs(
                sinon.match(`target/${fakeHash}.tar.gz`),
                [sinon.match('node_modules')],
                defaultOptions.compression
            );

            await local.push(fakeHash, defaultOptions);
            mock.verify();
        });

        it('should reject with BundleAlreadyExistsError if bundle with that name already in directory', () => {
            return assert.isRejected(local.push(fakeHash, defaultOptions), errors.BundleAlreadyExistsError);
        });
    });

    describe('validateOptions', () => {
        it('checks valid compression', () => {
            // @ts-ignore
            defaultOptions.compression = 'lsda';

            assert.throws(() => {
                local.validateOptions(defaultOptions);
            }, errors.InvalidOptionsError)
        });

        it('sets default compression type to `gzip`', () => {
            delete defaultOptions.compression;

            local.validateOptions(defaultOptions);

            assert.equal(defaultOptions.compression, 'gzip');
        });

        it('should throw InvalidOptionsError if target directory does\'n exist', () => {
            delete mockfsConfig.target;
            delete mockfsConfig[`target/${fakeHash}.tar.gz`];
            mockfs(mockfsConfig);

            assert.throws(() => {
                local.validateOptions(defaultOptions);
            }, errors.InvalidOptionsError)
        });
    });
});
