'use strict';

const _ = require('lodash');
const semver = require('semver');

const errors = require('./errors');
const npmWrapper = require('./commandWrappers/npmWrapper');

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

    if (config.npmVersion !== undefined) {
        validationPromises.push(
            npmWrapper.version()
                .then(version => {
                    if (!semver.satisfies(version, config.npmVersion)) {
                        throw new InvalidNpmVersionError(config.npmVersion, version);
                    }
                })
        );
    }

    if (config.veendorVersion !== undefined) {
        if (!semver.satisfies(global.VEENDOR_VERSION, config.veendorVersion)) {
            return Promise.reject(new InvalidVeendorVersionError(config.veendorVersion));
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

class EmptyBackendsPropertyError extends errors.VeendorError {
    constructor() {
        super('no backends found in config');
    }
}

class InvalidBackendError extends errors.VeendorError {
    constructor(alias, field) {
        super(`backend '${alias}' has lacks of has invalid '${field}' field`);
    }
}

class InvalidBackendOptionError extends errors.VeendorError {
    constructor(alias, field) {
        super(`backend\'s '${alias}' '${field}' option in invalid`);
    }
}

class EmptyBackendAliasError extends errors.VeendorError {
    constructor(position) {
        super(`backend at position '${position}' lacks or has invalid 'alias' field`);
    }
}

class InvalidNpmVersionError extends errors.VeendorError {
    constructor(expected, actual) {
        super(`npm version '${actual}' does not comply with '${expected}' constraint`);
    }
}

class InvalidVeendorVersionError extends errors.VeendorError {
    constructor(expected) {
        super(`veendor version '${global.VEENDOR_VERSION}' does not comply with '${expected}' constraint`);
    }
}

class AliasesNotUniqueError extends errors.VeendorError {}
class InvalidUseGitHistoryError extends errors.VeendorError {}

module.exports.EmptyBackendsPropertyError = EmptyBackendsPropertyError;
module.exports.InvalidBackendError = InvalidBackendError;
module.exports.InvalidBackendOptionError = InvalidBackendOptionError;
module.exports.EmptyBackendAliasError = EmptyBackendAliasError;
module.exports.InvalidNpmVersionError = InvalidNpmVersionError;
module.exports.InvalidVeendorVersionError = InvalidVeendorVersionError;
module.exports.AliasesNotUniqueError = AliasesNotUniqueError;
module.exports.InvalidUseGitHistoryError = InvalidUseGitHistoryError;
