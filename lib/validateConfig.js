'use strict';

const _ = require('lodash');

module.exports = function validateConfig(config) {
    if (!(config.backends instanceof Array) || config.backends.length === 0) {
        throw new EmptyBackendsPropertyError();
    }

    const aliases = _.map(config.backends, 'alias');

    if (_.uniq(aliases).length < aliases.length) {
        throw new AliasesNotUniqueError(`backends aliases are not unique`);
    }

    for (const [position, backend] of config.backends.entries()) {
        validateBackend(backend, position);
    }
};

function validateBackend(backend, position) {
    if (!(typeof backend.alias === 'string' && backend.alias.length > 0)) {
        throw new EmptyBackendAliasError(position);
    }

    if (typeof backend.backend.pull !== 'function') {
        throw new InvalidBackendError(backend.alias, 'pull');
    }

    if (typeof backend.backend.push !== 'function') {
        throw new InvalidBackendError(backend.alias, 'push');
    }

    if (typeof backend.backend.validateOptions !== 'function') {
        throw new InvalidBackendError(backend.alias, 'validateOptions');
    }

    backend.backend.validateOptions(backend.options);
}

class EmptyBackendsPropertyError extends Error {
    constructor() {
        super('no backends found in config');
    }
}

class InvalidBackendError extends Error {
    constructor(alias, field) {
        super(`backend '${alias}' has lacks of has invalid '${field}' field`);
    }
}

class EmptyBackendAliasError extends Error {
    constructor(position) {
        super(`backend at position '${position}' lacks or has invalid 'alias' field`);
    }
}

class AliasesNotUniqueError extends Error {}

module.exports.EmptyBackendsPropertyError = EmptyBackendsPropertyError;
module.exports.InvalidBackendError = InvalidBackendError;
module.exports.EmptyBackendAliasError = EmptyBackendAliasError;
module.exports.AliasesNotUniqueError = AliasesNotUniqueError;
