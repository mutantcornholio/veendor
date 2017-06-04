const assert = require('chai').assert;
const sinon = require('sinon');
const validateConfig = require('../../lib/validateConfig');

let config;

describe('validateConfig', function () {
    beforeEach(() => {
        config = {
            backends: [{}, {}]
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

    xit('sets fallbackToNpm to true');
    xit('sets installOnlyDiff to true');
    xit('sets packageHash to {}');
    xit('should throw error if useGetHistory is set without depth option');
});
