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

declare type BackendOptions = {};

declare type Config = {
    installDiff: boolean,
    fallbackToNpm: boolean,
    packageHash?: {

    },
    useGitHistory?: {
        depth: number,
    },
    backends: BackendConfig[] | undefined,
    veendorVersion?: string,
    npmVersion?: string,
}
