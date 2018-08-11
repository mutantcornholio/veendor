import _ from 'lodash';
import semver from 'semver';

import * as errors from './errors';
import npmWrapper from './commandWrappers/npmWrapper';

export type PartialConfig = {
    [P in keyof Config]?: P extends 'backends' ? Array<InputPartialBackendConfig> : Config[P]
}

type InputPartialBackendConfig = {
    [P in keyof BackendConfig]?: P extends 'backend' ? string | PartialBackend | any : BackendConfig[P] | any
}

type PartialBackend = Partial<Backend>;

export default function validateConfig(config: PartialConfig): Promise<Config> {
    const validationPromises = [];

    if (!(config.backends instanceof Array) || config.backends.length === 0) {
        return Promise.reject(new EmptyBackendsPropertyError());
    }

    const aliases = _.map(config.backends, 'alias');

    if (_.uniq(aliases).length < aliases.length) {
        return Promise.reject(new AliasesNotUniqueError(`backends aliases are not unique`));
    }

    for (const [position, backend] of config.backends.entries()) {
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

    if (typeof config.npmVersion === 'string') {
        const npmVersion = config.npmVersion;
        validationPromises.push(
            npmWrapper.version()
                .then(version => {
                    if (!semver.satisfies(version, npmVersion)) {
                        throw new InvalidNpmVersionError(npmVersion, version);
                    }
                })
        );
    }

    if (config.veendorVersion !== undefined) {
        if (!semver.satisfies(global.VEENDOR_VERSION, config.veendorVersion)) {
            return Promise.reject(new InvalidVeendorVersionError(config.veendorVersion));
        }
    }

    return Promise.all(validationPromises).then(() => <Config>config);
};

function validateBackend(backendConfig: InputPartialBackendConfig, position: number) {
    if (!(typeof backendConfig.alias === 'string' && backendConfig.alias.length > 0)) {
        return Promise.reject(new EmptyBackendAliasError(position));
    }

    if (typeof backendConfig.backend === 'string') {
        backendConfig.backend = require(`./backends/${backendConfig.backend}`);
    } else if (!(backendConfig.backend instanceof Object)) {
        return Promise.reject(new InvalidBackendError(backendConfig.alias, 'backend'));
    }

    if (typeof backendConfig.backend.pull !== 'function') {
        return Promise.reject(new InvalidBackendError(backendConfig.alias, 'pull'));
    }

    if (typeof backendConfig.backend.push !== 'function') {
        return Promise.reject(new InvalidBackendError(backendConfig.alias, 'push'));
    }

    if (typeof backendConfig.backend.validateOptions !== 'function') {
        return Promise.reject(new InvalidBackendError(backendConfig.alias, 'validateOptions'));
    }

    if (backendConfig.push === undefined) {
        backendConfig.push = false;
    }

    if (typeof backendConfig.push !== 'boolean') {
        return Promise.reject(new InvalidBackendOptionError(backendConfig.alias, 'push'));
    }

    if (backendConfig.pushMayFail === undefined) {
        backendConfig.pushMayFail = false;
    }

    if (typeof backendConfig.pushMayFail !== 'boolean') {
        return Promise.reject(new InvalidBackendOptionError(backendConfig.alias, 'pushMayFail'));
    }

    let validationResult;

    try {
        validationResult = backendConfig.backend.validateOptions(backendConfig.options);
    } catch (e) {
        return Promise.reject(e);
    }

    if (validationResult instanceof Promise) {
        return validationResult;
    }

    return Promise.resolve();
}

export class EmptyBackendsPropertyError extends errors.VeendorError {
    constructor() {
        super('no backends found in config');
    }
}

export class InvalidBackendError extends errors.VeendorError {
    constructor(alias: string, field: string) {
        super(`backend '${alias}' has lacks of has invalid '${field}' field`);
    }
}

export class InvalidBackendOptionError extends errors.VeendorError {
    constructor(alias: string, field: string) {
        super(`backend\'s '${alias}' '${field}' option in invalid`);
    }
}

export class EmptyBackendAliasError extends errors.VeendorError {
    constructor(position: number) {
        super(`backend at position '${position}' lacks or has invalid 'alias' field`);
    }
}

export class InvalidNpmVersionError extends errors.VeendorError {
    constructor(expected: string, actual: string) {
        super(`npm version '${actual}' does not comply with '${expected}' constraint`);
    }
}

export class InvalidVeendorVersionError extends errors.VeendorError {
    constructor(expected: string) {
        super(`veendor version '${global.VEENDOR_VERSION}' does not comply with '${expected}' constraint`);
    }
}

export class AliasesNotUniqueError extends errors.VeendorError {}
export class InvalidUseGitHistoryError extends errors.VeendorError {}
