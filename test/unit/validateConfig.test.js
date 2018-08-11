const {describe, it, beforeEach, afterEach} = require('mocha');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');

const assert = chai.assert;
chai.use(chaiAsPromised);

const validateConfig = require('@/lib/validateConfig');
const npmWrapper = require('@/lib/commandWrappers/npmWrapper');
const helpers = require('./helpers');
const veendorVersion = require('../../package.json').version;

let config;
let sandbox;

describe('validateConfig', function () {
    beforeEach(() => {
        config = {
            backends: [helpers.fakeBackendConfig('first'),helpers.fakeBackendConfig('second')]
        };

        sandbox = sinon.sandbox.create();

        VEENDOR_VERSION = veendorVersion;
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should reject with EmptyBackendsPropertyError if config does not contain \'backends\' section', done => {
        delete config.backends;

        assert.isRejected(validateConfig(config), validateConfig.EmptyBackendsPropertyError).notify(done);
    });

    it('should throw error if \'backends\' section is empty', done => {
        config.backends = [];

        assert.isRejected(validateConfig(config), validateConfig.EmptyBackendsPropertyError).notify(done);
    });

    it('should check whether backends have pull functions', done => {
        delete config.backends[0].backend.pull;

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendError).notify(done);
    });

    it('should check whether backends have push functions', done => {
        delete config.backends[0].backend.push;

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendError).notify(done);
    });

    it('should check whether backends have validateOptions functions', done => {
        delete config.backends[0].backend.validateOptions;

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendError).notify(done);
    });

    it('should check whether backends have aliases', done => {
        delete config.backends[0].alias;

        assert.isRejected(validateConfig(config), validateConfig.EmptyBackendAliasError).notify(done);
    });

    it('should check whether backend\'s push options are boolean[0]', done => {
        config.backends[0].push = 'test';

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendOptionError).notify(done);
    });

    it('should check whether backend\'s push options are boolean[1]', done => {
        config.backends[0].push = 1;

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendOptionError).notify(done);
    });

    it('should check whether backend\'s push options are boolean[2]', done => {
        config.backends[0].push = () => {};

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendOptionError).notify(done);
    });

    it('sets backend\'s push options to false', () => {
        config.backends[0].push = true;
        validateConfig(config);

        assert(config.backends[0].push === true, 'defined option should stay');
        assert(config.backends[1].push === false, 'config.backends[1].push should be `false`');
    });

    it('should check whether backend\'s pushMayFail options are boolean', done => {
        config.backends[0].pushMayFail = 'test';

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendOptionError).notify(done);
    });

    it('should check whether backend\'s pushMayFail options are boolean', done => {
        config.backends[0].pushMayFail = 1;

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendOptionError).notify(done);
    });

    it('should check whether backend\'s pushMayFail options are boolean', done => {
        config.backends[0].pushMayFail = () => {};

        assert.isRejected(validateConfig(config), validateConfig.InvalidBackendOptionError).notify(done);
    });

    it('sets backend\'s pushMayFail options to false', done => {
        config.backends[0].pushMayFail = true;
        const checkResult = () => helpers.notifyAssert(() => {
            assert(config.backends[0].pushMayFail === true, 'defined option should stay');
            assert(config.backends[1].pushMayFail === false, 'config.backends[1].push should be `false`');
        }, done);

        validateConfig(config).then(checkResult, checkResult);
    });

    it('should check whether backends aliases are unique', done => {
        config.backends[0].alias = config.backends[1].alias;

        assert.isRejected(validateConfig(config), validateConfig.AliasesNotUniqueError).notify(done);
    });

    it('should call backend\'s validateOptions function', done => {
        const backend0Mock = sinon.mock(config.backends[0].backend)
            .expects('validateOptions')
            .withArgs(sinon.match.same(config.backends[0].options));

        const backend1Mock = sinon.mock(config.backends[1].backend)
            .expects('validateOptions')
            .withArgs(sinon.match.same(config.backends[1].options));

        const checkResult = () => helpers.notifyAssert(() => {
            backend0Mock.verify();
            backend1Mock.verify();
        }, done);

        validateConfig(config).then(checkResult, checkResult);
    });

    it('should reject if backend\'s validateOptions throws', done => {
        sinon.stub(config.backends[0].backend, 'validateOptions').throws(new helpers.AnError);

        assert.isRejected(validateConfig(config), helpers.AnError).notify(done);
    });

    it('sets fallbackToNpm to true', done => {
        const checkResult = () => helpers.notifyAssert(() => {
            assert(config.fallbackToNpm === true);
        }, done);

        validateConfig(config).then(checkResult, checkResult);
    });

    it('sets installDiff to true', done => {
        const checkResult = () => helpers.notifyAssert(() => {
            assert(config.installDiff === true);
        }, done);

        validateConfig(config).then(checkResult, checkResult);
    });

    it('sets packageHash to {}', done => {
        const checkResult = () => helpers.notifyAssert(() => {
            assert.isObject(config.packageHash);
        }, done);

        validateConfig(config).then(checkResult, checkResult);
    });

    it('should throw error if useGitHistory is set and installDiff is false', done => {
        config.useGitHistory = {depth: 5};
        config.installDiff = false;

        assert.isRejected(validateConfig(config), validateConfig.InvalidUseGitHistoryError).notify(done);
    });

    it('should throw error if useGitHistory is set without depth option', done => {
        config.useGitHistory = {};

        assert.isRejected(validateConfig(config), validateConfig.InvalidUseGitHistoryError).notify(done);
    });

    it('should throw error if useGitHistory.depth is zero or below zero', done => {
        helpers.notifyAssert(() => {
            config.useGitHistory = {depth: 0};

            assert.isRejected(validateConfig(config), validateConfig.InvalidUseGitHistoryError);

            config.useGitHistory = {depth: -2};

            assert.isRejected(validateConfig(config), validateConfig.InvalidUseGitHistoryError);
        }, done);
    });

    it('should resolve backend from string to module', done => {
        config.backends[0].backend = 'local';
        config.backends[0].options = {directory: '.'};

        validateConfig(config).then(() => {
            assert.equal(config.backends[0].backend, require('@/lib/backends/local'));
        });

        done();
    });

    it('should throw if backend property is not defined', () => {
        config.backends[0].backend = undefined;

        return assert.isRejected(validateConfig(config), validateConfig.InvalidBackendError);
    });

    it('should throw InvalidNpmVersionError if npmVersion returns incompatible version', done => {
        sandbox.stub(npmWrapper, 'version').returns(Promise.resolve('5.4.3'));

        config.npmVersion = '>6.6.6';

        assert.isRejected(validateConfig(config), validateConfig.InvalidNpmVersionError).notify(done);
    });

    it('should resolve, if npm version check passes', done => {
        sandbox.stub(npmWrapper, 'version').returns(Promise.resolve('5.4.3'));

        config.npmVersion = '5.x.x';

        assert.isFulfilled(validateConfig(config)).notify(done);
    });

    it('should throw InvalidVeendorVersionError if veendor does not comply with veendorVersion constraint', done => {
        VEENDOR_VERSION = '2.0.0';
        config.veendorVersion = '>2.1.0';

        assert.isRejected(validateConfig(config), validateConfig.InvalidVeendorVersionError).notify(done);
    });

    it('should resolve, if veendor version is compatible', done => {
        VEENDOR_VERSION = '2.0.0';
        config.veendorVersion = '^2';

        assert.isFulfilled(validateConfig(config)).notify(done);
    });
});
