declare namespace NodeJS {
    interface Global {
        VEENDOR_VERSION: string
    }
}

declare type BackendConfig = {
    backend: Backend,
    alias: string,
    push: boolean,
    pushMayFail: boolean,
    options: BackendOptions,
}

declare type Backend = {
    pull: (hash: string, options: BackendOptions, cacheDir: string) => Promise<any>,
    push: (hash: string, options: BackendOptions, cacheDir: string) => Promise<any>,
    validateOptions: (options: BackendOptions) => Promise<any>,
}

declare type BackendOptions = object;

declare type Config = {
    installDiff: boolean,
    fallbackToNpm: boolean,
    packageHash?: PackageHashOptions,
    useGitHistory?: {
        depth: number,
    },
    backends: BackendConfig[] | undefined,
    veendorVersion?: string,
    npmVersion?: string,
}

declare type PkgJson = {
    dependencies: object,
    devDependencies: object,
}

declare type PackageHashOptions = {
    suffix?: (() => string) | string
}
