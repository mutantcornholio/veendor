import {StringMap} from '@/serviceTypes';
import {Tracer} from 'tracer';
import {ProgressStream} from '@/lib/util/progress';

export type BackendConfig = {
    backend: Backend,
    alias: string,
    push?: boolean,
    pushMayFail?: boolean,
    options: BackendOptions,
}

export type Backend = {
    pull: (hash: string, options: BackendOptions, cacheDir: string, toolsProvider: BackendToolsProvider) => Promise<any>,
    push: (hash: string, options: BackendOptions, cacheDir: string, toolsProvider: BackendToolsProvider) => Promise<any>,
    validateOptions: (options: BackendOptions) => Promise<any>,
    keepCache?: boolean,
}

export type BackendToolsProvider = {
    getLogger: () => Tracer.Logger,
    getProgressStream: (label?: string, total?: number) => ProgressStream,
}

export type BackendOptions = object;

export enum BackendCalls {pull, push, validateOptions}

export type Config = {
    installDiff: boolean,
    fallbackToNpm: boolean,
    packageHash?: PackageHashOptions,
    useGitHistory?: {
        depth: number,
    },
    backends: BackendConfig[],
    veendorVersion?: string,
    npmVersion?: string,
    dedupe?: boolean,
}

export type ConfigWithHistory = Config & {
    useGitHistory: {
        depth: number,
    },
};

export function configHasHistory(config: Config): config is ConfigWithHistory {
    return typeof config.useGitHistory === 'object' && config.useGitHistory.depth > 0;
}

export type PkgJson = {
    dependencies: StringMap,
    devDependencies: StringMap,
}

export type PackageHashOptions = {
    suffix?: (() => string) | string
}

export function invariant(value: unknown, message = ''): asserts value {
    if (!Boolean(value)) {
        throw new Error(`This can not happen ${message}`);
    }
}
