const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const path = require('path');

const assert = chai.assert;
chai.use(chaiAsPromised);

const local = require('../../../lib/backends/local');
const tarWrapper = require('../../../lib/commandWrappers/tarWrapper');
const errors = require('../../../lib/errors');

let sandbox;
let fakeHash;
let defaultOptions;
let mockfsConfig;

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
        it('should unpack archive to pwd', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.extractArchive,
                args: [sinon.match(`target/${fakeHash}.tar.gz`)]
            }], done);

            local.pull(fakeHash, defaultOptions, '.veendor/local').then(checkResult, checkResult);
        });

        it('should respect desired compression', done => {
            defaultOptions.compression = 'xz';
            mockfsConfig[`target/${fakeHash}.tar.xz`] = 'somestuff';
            mockfs(mockfsConfig);

            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.extractArchive,
                args: [sinon.match(`target/${fakeHash}.tar.xz`)]
            }], done);

            local.pull(fakeHash, defaultOptions, '.veendor/local').then(checkResult, checkResult);
        });

        it('should not call tar if archive is not in target directory', done => {
            delete mockfsConfig[`target/${fakeHash}.tar.gz`];
            mockfs(mockfsConfig);

            const checkResult = () => {
                if (!(tarWrapper.extractArchive.notCalled)) {
                    return done(new Error(`Expected 'tarWrapper.extractArchive' not to be called\n` +
                        `It was called with: [${tarWrapper.extractArchive.getCalls().join(', ')}}]`))
                }

                done();
            };

            local.pull(fakeHash, defaultOptions, '.veendor/local').then(checkResult, checkResult);
        });

        it('should reject with \'BundleNotFoundError\' if archive is not in target directory', done => {
            delete mockfsConfig[`target/${fakeHash}.tar.gz`];
            mockfs(mockfsConfig);

            assert
                .isRejected(local.pull(fakeHash, defaultOptions, '.veendor/local'), errors.BundleNotFoundError)
                .notify(done);
        });
    });

    describe('push', () => {
        it('should pack node_modules to target directory', done => {
            const checkResult = expectCalls.bind(null, [{
                spy: tarWrapper.createArchive,
                args: [
                    sinon.match(`target/${fakeHash}.tar.gz`),
                    [sinon.match('node_modules')],
                    defaultOptions.compression
                ]
            }], done);

            local.push(fakeHash, defaultOptions, '.veendor/local').then(checkResult, checkResult);
        });
    });

    describe('validateOptions', () => {
        it('checks valid compression', () => {
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

function expectCalls(expectPairs, done) {
    for (const expect of expectPairs) {
        if (!expect.spy.calledWith(...expect.args)) {
            return done(new Error(`Expected spy "${expect.spy.displayName}" ` +
                `to be called with [${expect.args.join(', ')}]\n` +
                `Actual calls were: [${expect.spy.getCalls().join(', ')}]`))
        }
    }

    done();
}
