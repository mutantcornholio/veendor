const assert = require('chai').assert;
const sinon = require('sinon');
const validateConfig = require('../../lib/validateConfig');
const it = require("mocha/lib/mocha.js").it;
const describe = require('mocha/lib/mocha.js').describe;
const beforeEach = require('mocha/lib/mocha.js').beforeEach;

let config;

describe('validateConfig', function () {
    beforeEach(() => {
        config = {
            backends: [{}, {}]
        };
    });

    it('should throws error if config does not contain \'backends\' section', () => {
        delete config.backends;
        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.EmptyBackendsPropertyError);
    });

    it('should throws error if \'backends\' section is empty', () => {
        config.backends = [];

        assert.throws(() => {
            validateConfig(config);
        }, validateConfig.EmptyBackendsPropertyError);
    });

    xit('should throw error if more than single backend has push option');
    xit('should if any backend has push option, but it not the last one');
    xit('sets fallbackToNpm to true');
    xit('sets installOnlyDiff to true');
    xit('sets packageHash to {}');
});
