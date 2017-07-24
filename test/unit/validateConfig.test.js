const {describe, it, beforeEach, afterEach} = require('mocha');

const assert = require('chai').assert;
const sinon = require('sinon');

const validateConfig = require('../../lib/validateConfig');
const helpers = require('./helpers');

let config;

describe('validateConfig', function () {
    beforeEach(() => {
        config = {
            backends: [helpers.fakeBackendConfig('first'),helpers.fakeBackendConfig('second')]
        };
    });

    it('should throw error if config does not contain \'backends\' section', () => {
        delete config.backends;

        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.EmptyBackendsPropertyError);
    });

    it('should throw error if \'backends\' section is empty', () => {
        config.backends = [];

        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.EmptyBackendsPropertyError);
    });

    it('should check whether backends have pull functions', () => {
        delete config.backends[0].backend.pull;

        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.InvalidBackendError);
    });

    it('should check whether backends have push functions', () => {
        delete config.backends[0].backend.push;

        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.InvalidBackendError);
    });

    it('should check whether backends have validateOptions functions', () => {
        delete config.backends[0].backend.validateOptions;

        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.InvalidBackendError);
    });

    it('should check whether backends have aliases', () => {
        delete config.backends[0].alias;

        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.EmptyBackendAliasError);
    });

    it('should check whether backends aliases are unique', () => {
        config.backends[0].alias = config.backends[1].alias;

        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.AliasesNotUniqueError);
    });

    it('should call backend\'s validateOptions function', () => {
        const backend0Mock = sinon.mock(config.backends[0].backend)
            .expects('validateOptions')
            .withArgs(sinon.match.same(config.backends[0].options));

        const backend1Mock = sinon.mock(config.backends[1].backend)
            .expects('validateOptions')
            .withArgs(sinon.match.same(config.backends[1].options));

        validateConfig(config);

        backend0Mock.verify();
        backend1Mock.verify();
    });

    it('sets fallbackToNpm to true', () => {
        validateConfig(config);

        assert(config.fallbackToNpm === true);
    });

    xit('sets installOnlyDiff to true');
    xit('sets packageHash to {}');
    xit('should throw error if useGetHistory is set without depth option');

    xit('should throw error if npmTimeout is\'n positive/zero number');
    xit('should set default npm timeout to 0');
});
