'use strict';

module.exports = function validateConfig(config) {
    if (!(config.backends instanceof Array) || config.backends.length === 0) {
        throw new EmptyBackendsPropertyError();
    }
};

class EmptyBackendsPropertyError extends Error {}

module.exports.EmptyBackendsPropertyError = EmptyBackendsPropertyError;
