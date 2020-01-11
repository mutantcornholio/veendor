'use strict';

import {getLogger} from '@/lib/util/logger';
import * as helpers from './helpers';
import pushBackends from './pushBackends';
import * as rsyncWrapper from '@/lib/commandWrappers/rsyncWrapper';
import * as npmWrapper from '@/lib/commandWrappers/npmWrapper';
import * as gitWrapper from '@/lib/commandWrappers/gitWrapper';
import * as errors from '@/lib/errors';
import _ from 'lodash';
import * as objectDiff from 'deep-object-diff';
import path from 'path';
import fsExtra from 'fs-extra';

import {BackendCalls, BackendConfig, Config, configHasHistory, PkgJson} from '@/types';
import {getFSHash, getHistoryHash} from "@/lib/install/hashGetters";
import {provideBackendCallTools} from '@/lib/util/progress';

const {nodeModules, pkgJsonPath, originalCwd} = helpers.paths;
// let clearNodeModulesPromise: Promise<void>;
let isRsyncModeEnabled = false;

type PullInfo = {
    missingBackends: BackendConfig[];
}

enum InstallStages {
    firstPull,
    pullFromGitHistory,
    npmInstallDiff,
    npmInstallAll,
    pushing,
}

export type InstallParams = {
    force?: boolean, // remove node_modules if exist
    config: Config,
    lockfilePath?: string | null, // path to lockfile, detected at startup. null, if no lockfile detected
    rsyncMode?: boolean,
};

export default async function install(
    {force = false, config, lockfilePath = null, rsyncMode = false}: InstallParams
): Promise<void> {
    const logger = getLogger();

    let backendsToPush: BackendConfig[] = [];

    const [rsyncAvailable, nodeModulesInPlace] = await Promise.all([
        rsyncWrapper.rsyncAvailable(),
        nodeModulesAlreadyExist(),
    ]);

    isRsyncModeEnabled = rsyncMode && rsyncAvailable && nodeModulesInPlace;

    if (isRsyncModeEnabled) {
        logger.info('Working in rsync mode');
    }

    const isGitRepo = await gitWrapper.isGitRepo(originalCwd);

    if (nodeModulesInPlace) {
        if (!force) {
            throw new NodeModulesAlreadyExistError();
        }

        if (!isRsyncModeEnabled) {
            logger.trace('Started removing node_modules');
            clearNodeModules().then(
                () => {logger.trace('Successfully removed node_modules');},
                err => {logger.debug(`Error during node_modules removal: ${err.stack}`);}
            );
        }
    }

    /**
     * Calculating current hash
     */
    let {hash, pkgJson} = await getFSHash(config, pkgJsonPath, lockfilePath);
    logger.info(`Got hash:\t${hash}`);

    /**
     * Downloading deps
     */
    let installStage: InstallStages = InstallStages.firstPull;
    let tryingHash = hash;
    let tryingPkgJson = pkgJson;
    let historyIndexStart = 0;
    while (true) {
        try {
            if (installStage === InstallStages.firstPull) {
                const info = await pullBackends(tryingHash, config, lockfilePath);
                backendsToPush = info.missingBackends;
                installStage = InstallStages.pushing;
                break;
            }

            if (installStage === InstallStages.pullFromGitHistory) {
                await pullBackends(tryingHash, config, lockfilePath);
                installStage = InstallStages.npmInstallDiff;
                continue;
            }

            if (installStage === InstallStages.npmInstallDiff) {
                await installDiff(tryingPkgJson, pkgJson);
                backendsToPush = config.backends;
                installStage = InstallStages.pushing;
                break;
            }

            if (installStage === InstallStages.npmInstallAll) {
                await npmInstallAll();
                backendsToPush = config.backends;
                installStage = InstallStages.pushing;
                break;
            }
        } catch (pullError) {
            if (pullError instanceof BundlesNotFoundError) {
                if (installStage === InstallStages.firstPull || installStage === InstallStages.pullFromGitHistory) {
                    if (configHasHistory(config) && isGitRepo) {
                        installStage = InstallStages.pullFromGitHistory;
                        try {
                            const res = await getHistoryHash(config, lockfilePath, tryingHash, historyIndexStart);
                            tryingHash = res.hash;
                            tryingPkgJson = res.pkgJson;
                            historyIndexStart = res.historyIndexEnd;
                            continue;
                        } catch (historyHashError) {
                            if (historyHashError instanceof BundlesNotFoundError) {
                                logger.trace(historyHashError);
                            }
                        }
                    }

                    if (!config.fallbackToNpm) {
                        logger.error(
                            `Couldn't find bundle with hash '${hash}'. 'fallbackToNpm' isn't set. Exiting`
                        );
                        throw pullError;
                    }

                    installStage = InstallStages.npmInstallAll;
                }
            } else {
                throw pullError;
            }
        }
    }

    /**
     * Pushing bundle
     */
    try {
        await pushBackends(backendsToPush, hash, false);
    } catch (pushError) {
        if (pushError instanceof errors.RePullNeeded) {
            // this happens if we failed to push bundle because someone got faster then us
            // in this case, we're gonna download bundle someone else has built
            // if true, catching BundleAlreadyExistsError from backend will reject result
            // just to make sure, we won't fall into infinite loop here

            await pullBackends(hash, config, lockfilePath);

        } else {
            throw pushError;
        }
    }
}

async function nodeModulesAlreadyExist(): Promise<boolean> {
    const logger = getLogger();
    logger.trace('Checking node_modules');

    try {
        await fsExtra.access(nodeModules);
        logger.trace('\'node_modules\' directory already exists');
        return true
    } catch (err) {
        logger.trace('Node_modules not found');
        return false;
    }
}

async function clearNodeModules(): Promise<void> {
    const logger = getLogger();
    if (isRsyncModeEnabled) {
        return;
    }

    logger.trace(`moving node_modules to node_modules.bak.0`);

    let bodyCount = 0;
    let bakDirname;
    while (true) {
        bakDirname = `${nodeModules}.bak.${bodyCount}`;
        logger.trace(`moving node_modules to ${bakDirname}`);
        try {
            await fsExtra.stat(bakDirname);
            logger.trace(`${bakDirname} already exists; incrementing`);
            bodyCount++;
        } catch (err) {
            if (err.code && err.code === 'ENOENT') {
                await fsExtra.rename(nodeModules, bakDirname);
                logger.trace(`move was successful; removing ${bakDirname} without blocking`);
                return fsExtra.remove(bakDirname);
            }
        }
    }
}

async function pullBackends(
    hash: string, config: Config, lockfilePath: string | null, backendIndex = 0
): Promise<PullInfo> {
    const logger = getLogger();
    const backendConfig = config.backends[backendIndex];

    if (!backendConfig) {
        throw new BundlesNotFoundError(`Backends don't have bundle ${hash}`);
    }

    logger.info(`Trying backend '${backendConfig.alias}' with hash ${hash}`);

    try {
        const cacheDirPath = await helpers.createCleanCacheDir(backendConfig);

        if (isRsyncModeEnabled) {
            await helpers.createCleanCwd(lockfilePath);
        }

        await backendConfig.backend.pull(
            hash, backendConfig.options, cacheDirPath,
            provideBackendCallTools(backendConfig, BackendCalls.push)
        );

        if (isRsyncModeEnabled) {
            logger.info(`Successfully fetched ${hash} from '${backendConfig.alias}'. Unpacking.`);

            const newNodeModules = path.resolve(process.cwd(), 'node_modules');
            helpers.restoreCWD();
            await rsyncWrapper.syncDirs(newNodeModules, process.cwd());
        }

        logger.info(`Pulled ${hash} from backend '${backendConfig.alias}'`);

        return {missingBackends: config.backends.slice(0, backendIndex)};
    } catch (error) {
        helpers.restoreCWD();

        if (error instanceof errors.BundleNotFoundError) {
            return pullBackends(hash, config, lockfilePath, backendIndex + 1);
        } else {
            logger.error(
                `Backend '${backendConfig.alias}' failed on pull:`
            );
            throw error;
        }
    }
}

async function installDiff(oldPkgJson: PkgJson, newPkgJson: PkgJson): Promise<void> {
    const logger = getLogger();
    const allDepsOld = Object.assign({}, oldPkgJson.devDependencies, oldPkgJson.dependencies);
    const allDepsNew = Object.assign({}, newPkgJson.devDependencies, newPkgJson.dependencies);
    const depsDiff = objectDiff.diff(allDepsOld, allDepsNew);
    const depsToInstall = _.omitBy(depsDiff, _.isUndefined);
    const depsToUninstall = _.keys(_.pickBy(depsDiff, _.isUndefined));

    const loggingDepsToInstall = 'Installing dependencies: ' +
        Object.keys(depsToInstall).map(pkg => `${pkg}@${depsToInstall[pkg]}`).join(' ');

    const loggingDepsToUninstall = 'Uninstalling dependencies: ' + depsToUninstall.join(' ');

    if (_.keys(depsToInstall).length) {
        logger.info(loggingDepsToInstall);

        await npmWrapper.install(depsToInstall);
    }

    if (depsToUninstall.length) {
        logger.info(loggingDepsToUninstall);
        await npmWrapper.uninstall(depsToUninstall);
    }
}

function npmInstallAll() {
    const logger = getLogger();

    logger.info('Couldn\'t find bundles. Running npm install');

    return npmWrapper.installAll();
}

export class PkgJsonNotFoundError extends errors.VeendorError {}
export class NodeModulesAlreadyExistError extends errors.VeendorError {
    constructor() {
        super('NodeModulesAlreadyExistError');
    }
}
export class BundlesNotFoundError extends errors.VeendorError {}
