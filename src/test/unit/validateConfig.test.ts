import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import chai from 'chai';

import {invariant} from '@/types';

import {
    AliasesNotUniqueError,
    EmptyBackendAliasError,
    InvalidBackendOptionError,
    PartialConfig
} from '@/lib/validateConfig';
import * as npmWrapper from '@/lib/commandWrappers/npmWrapper';

import validateConfig, {
    EmptyBackendsPropertyError,
    InvalidVeendorVersionError,
    InvalidNpmVersionError,
    InvalidBackendError,
    InvalidUseGitHistoryError,
} from '@/lib/validateConfig';
import * as helpers from './helpers';


const assert = chai.assert;
chai.use(chaiAsPromised);
let config: PartialConfig = {
    backends: [helpers.fakeBackendConfig('first'),helpers.fakeBackendConfig('second')]
};
let sandbox: sinon.SinonSandbox;

describe('validateConfig', function () {
    beforeEach(() => {
        config = {
            backends: [helpers.fakeBackendConfig('first'),helpers.fakeBackendConfig('second')]
        };

        sandbox = sinon.sandbox.create();

        const veendorVersion = require('../../../package.json').version;
        global.VEENDOR_VERSION = veendorVersion;
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should reject with EmptyBackendsPropertyError if config does not contain \'backends\' section', () => {
        delete config.backends;

        return assert.isRejected(validateConfig(config), EmptyBackendsPropertyError);
    });

    it('should throw error if \'backends\' section is empty', () => {
        config.backends = [];

        return assert.isRejected(validateConfig(config), EmptyBackendsPropertyError);
    });

    it('should check whether backends have pull functions', () => {
        invariant(config.backends);
        delete config.backends[0].backend.pull;

        return assert.isRejected(validateConfig(config), InvalidBackendError);
    });

    it('should check whether backends have push functions', () => {
        invariant(config.backends);
        delete config.backends[0].backend.push;

        return assert.isRejected(validateConfig(config), InvalidBackendError);
    });

    it('should check whether backends have validateOptions functions', () => {
        invariant(config.backends);
        delete config.backends[0].backend.validateOptions;

        return assert.isRejected(validateConfig(config), InvalidBackendError);
    });

    it('should check whether backends have aliases', () => {
        invariant(config.backends);
        delete config.backends[0].alias;

        return assert.isRejected(validateConfig(config), EmptyBackendAliasError);
    });

    it('should check whether backend\'s push options are boolean[0]', () => {
        invariant(config.backends);
        config.backends[0].push = 'test';

        return assert.isRejected(validateConfig(config), InvalidBackendOptionError);
    });

    it('should check whether backend\'s push options are boolean[1]', () => {
        invariant(config.backends);
        config.backends[0].push = 1;

        return assert.isRejected(validateConfig(config), InvalidBackendOptionError);
    });

    it('should check whether backend\'s push options are boolean[2]', () => {
        invariant(config.backends);
        config.backends[0].push = () => {};

        return assert.isRejected(validateConfig(config), InvalidBackendOptionError);
    });

    it('sets backend\'s push options to false', () => {
        invariant(config.backends);
        config.backends[0].push = true;
        validateConfig(config);

        assert(config.backends[0].push === true, 'defined option should stay');
        assert(config.backends[1].push === false, 'config.backends[1].push should be `false`');
    });

    it('should check whether backend\'s pushMayFail options are boolean', () => {
        invariant(config.backends);
        config.backends[0].pushMayFail = 'test';

        return assert.isRejected(validateConfig(config), InvalidBackendOptionError);
    });

    it('should check whether backend\'s pushMayFail options are boolean', () => {
        invariant(config.backends);
        config.backends[0].pushMayFail = 1;

        return assert.isRejected(validateConfig(config), InvalidBackendOptionError);
    });

    it('should check whether backend\'s pushMayFail options are boolean', () => {
        invariant(config.backends);
        config.backends[0].pushMayFail = () => {};

        return assert.isRejected(validateConfig(config), InvalidBackendOptionError);
    });

    it('sets backend\'s pushMayFail options to false', done => {
        invariant(config.backends);

        config.backends[0].pushMayFail = true;
        const checkResult = () => helpers.notifyAssert(() => {
            invariant(config.backends);

            assert(config.backends[0].pushMayFail === true, 'defined option should stay');
            assert(config.backends[1].pushMayFail === false, 'config.backends[1].push should be `false`');
        }, done);

        validateConfig(config).then(checkResult, checkResult);
    });

    it('should check whether backends aliases are unique', () => {
        invariant(config.backends);
        config.backends[0].alias = config.backends[1].alias;

        return assert.isRejected(validateConfig(config), AliasesNotUniqueError);
    });

    it('should call backend\'s validateOptions function', done => {
        invariant(config.backends);
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

    it('should reject if backend\'s validateOptions throws', () => {
        invariant(config.backends);
        sinon.stub(config.backends[0].backend, 'validateOptions').throws(new helpers.AnError);

        return assert.isRejected(validateConfig(config), helpers.AnError);
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

    it('should throw error if useGitHistory is set and installDiff is false', () => {
        config.useGitHistory = {depth: 5};
        config.installDiff = false;

        return assert.isRejected(validateConfig(config), InvalidUseGitHistoryError);
    });

    it('should throw error if useGitHistory is set without depth option', () => {
        // @ts-ignore
        config.useGitHistory = {};

        return assert.isRejected(validateConfig(config), InvalidUseGitHistoryError);
    });

    it('should throw error if useGitHistory.depth is zero or below zero', done => {
        helpers.notifyAssert(() => {
            config.useGitHistory = {depth: 0};

            assert.isRejected(validateConfig(config), InvalidUseGitHistoryError);

            config.useGitHistory = {depth: -2};

            assert.isRejected(validateConfig(config), InvalidUseGitHistoryError);
        }, done);
    });

    it('should resolve backend from string to module', async () => {
        invariant(config.backends);
        config.backends[0].backend = 'local';
        config.backends[0].options = {directory: '.'};

        await validateConfig(config);

        invariant(config.backends);
        assert.equal(config.backends[0].backend, require('@/lib/backends/local'));
    });

    it('should throw if backend property is not defined', () => {
        // @ts-ignore
        config.backends[0].backend = undefined;

        return assert.isRejected(validateConfig(config), InvalidBackendError);
    });

    it('should throw InvalidNpmVersionError if npmVersion returns incompatible version', () => {
        sandbox.stub(npmWrapper, 'version').returns(Promise.resolve('5.4.3'));

        config.npmVersion = '>6.6.6';

        return assert.isRejected(validateConfig(config), InvalidNpmVersionError);
    });

    it('should resolve, if npm version check passes', () => {
        sandbox.stub(npmWrapper, 'version').returns(Promise.resolve('5.4.3'));

        config.npmVersion = '5.x.x';

        return assert.isFulfilled(validateConfig(config));
    });

    it('should throw InvalidVeendorVersionError if veendor does not comply with veendorVersion constraint', () => {
        global.VEENDOR_VERSION = '2.0.0';
        config.veendorVersion = '>2.1.0';

        return assert.isRejected(validateConfig(config), InvalidVeendorVersionError);
    });

    it('should resolve, if veendor version is compatible', () => {
        global.VEENDOR_VERSION = '2.0.0';
        config.veendorVersion = '^2';

        return assert.isFulfilled(validateConfig(config));
    });

    it('should set default `dedupe` value', async () => {
        const res = await validateConfig(config);
        return assert.equal(res.dedupe, false);
    });

    it('should set default `clearSharedCache` value', async () => {
        const res = await validateConfig(config);
        return assert.equal(res.clearSharedCache, false);
    });
});
