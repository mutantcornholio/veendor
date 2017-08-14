'use strict';

const _ = require('lodash');
const path = require('path');

module.exports = function validateConfig(config) {
    const validationPromises = [];

    if (!(config.backends instanceof Array) || config.backends.length === 0) {
        return Promise.reject(new EmptyBackendsPropertyError());
    }

    const aliases = _.map(config.backends, 'alias');

    if (_.uniq(aliases).length < aliases.length) {
        return Promise.reject(new AliasesNotUniqueError(`backends aliases are not unique`));
    }

    for (const [position, backend] of config.backends.entries()) {
        if (typeof backend.backend === 'string') {
            backend.backend = require(`./backends/${backend.backend}`);
        }

        validationPromises.push(validateBackend(backend, position));
    }

    if (config.fallbackToNpm === undefined) {
        config.fallbackToNpm = true;
    }

    if (config.packageHash === undefined) {
        config.packageHash = {};
    }

    if (config.installDiff === undefined) {
        config.installDiff = true;
    }

    if (!(config.installDiff) && config.useGitHistory) {
        return Promise.reject(new InvalidUseGitHistoryError(
            'Setting both \'installDiff\' and \'useGitHistory\' doesn\'t make any sense'
        ));
    }

    if (config.useGitHistory) {
        if (!_.isNumber(config.useGitHistory.depth)) {
            return Promise.reject(new InvalidUseGitHistoryError(
                '\'useGitHistory\' should be used with \'depth\' option'
            ));
        }

        if (config.useGitHistory.depth < 1) {
            return Promise.reject(new InvalidUseGitHistoryError(
                '\'useGitHistory.depth\' should be positive number'
            ));
        }
    }

    return Promise.all(validationPromises);
};

function validateBackend(backend, position) {
    if (!(typeof backend.alias === 'string' && backend.alias.length > 0)) {
        return Promise.reject(new EmptyBackendAliasError(position));
    }

    if (typeof backend.backend.pull !== 'function') {
        return Promise.reject(new InvalidBackendError(backend.alias, 'pull'));
    }

    if (typeof backend.backend.push !== 'function') {
        return Promise.reject(new InvalidBackendError(backend.alias, 'push'));
    }

    if (typeof backend.backend.validateOptions !== 'function') {
        return Promise.reject(new InvalidBackendError(backend.alias, 'validateOptions'));
    }

    if (backend.push === undefined) {
        backend.push = false;
    }

    if (typeof backend.push !== 'boolean') {
        return Promise.reject(new InvalidBackendOptionError(backend.alias, 'push'));
    }

    if (backend.pushMayFail === undefined) {
        backend.pushMayFail = false;
    }

    if (typeof backend.pushMayFail !== 'boolean') {
        return Promise.reject(new InvalidBackendOptionError(backend.alias, 'pushMayFail'));
    }

    let validationResult;

    try {
        validationResult = backend.backend.validateOptions(backend.options);
    } catch (e) {
        return Promise.reject(e);
    }

    if (validationResult instanceof Promise) {
        return validationResult;
    }

    return Promise.resolve();
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

class InvalidBackendOptionError extends Error {
    constructor(alias, field) {
        super(`backend\'s '${alias}' '${field}' option in invalid`);
    }
}

class EmptyBackendAliasError extends Error {
    constructor(position) {
        super(`backend at position '${position}' lacks or has invalid 'alias' field`);
    }
}

class AliasesNotUniqueError extends Error {}
class InvalidUseGitHistoryError extends Error {}

module.exports.EmptyBackendsPropertyError = EmptyBackendsPropertyError;
module.exports.InvalidBackendError = InvalidBackendError;
module.exports.InvalidBackendOptionError = InvalidBackendOptionError;
module.exports.EmptyBackendAliasError = EmptyBackendAliasError;
module.exports.AliasesNotUniqueError = AliasesNotUniqueError;
module.exports.InvalidUseGitHistoryError = InvalidUseGitHistoryError;
