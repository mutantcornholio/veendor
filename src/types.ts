import {StringMap} from "@/serviceTypes";

export type BackendConfig = {
    backend: Backend,
    alias: string,
    push: boolean,
    pushMayFail: boolean,
    options: BackendOptions,
}

export type Backend = {
    pull: (hash: string, options: BackendOptions, cacheDir: string) => Promise<any>,
    push: (hash: string, options: BackendOptions, cacheDir: string) => Promise<any>,
    validateOptions: (options: BackendOptions) => Promise<any>,
    keepCache?: boolean,
}

export type BackendOptions = object;

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
