'use strict';

import {getLogger} from '@/lib/logger';
import * as helpers from './helpers';
import pushBackends from './pushBackends';
import rsyncWrapper from '@/lib/commandWrappers/rsyncWrapper';
import npmWrapper from '@/lib/commandWrappers/npmWrapper';
import * as gitWrapper from '@/lib/commandWrappers/gitWrapper';
import * as errors from '@/lib/errors';
import _ from 'lodash';
import * as objectDiff from 'deep-object-diff';
import path from 'path';
import fsExtra from 'fs-extra';

import {BackendConfig, Config, configHasHistory, PkgJson} from '@/types';
import {getFSHash, getHistoryHash} from "@/lib/install/hashGetters";

const {nodeModules, pkgJsonPath, originalCwd} = helpers.paths;
let clearNodeModulesPromise: Promise<void>;
let rsyncAvailable = false;

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

export default async function install(
    {force = false, config, rePull = false, rePullHash = null, lockfilePath = null}:
    {
        force: boolean, // remove node_modules if exist
        config: Config,
        rePull: boolean, // this happens if we failed to push bundle because someone got faster then us
                         // in this case, we're gonna download bundle someone else has built
                         // if true, catching BundleAlreadyExistsError from backend will reject result
                         // just to make sure, we won't fall into infinite loop here
        rePullHash: string | null, // hash, on which push has failed
                                   // we need to be sure that we'll go with the same hash the second time
        lockfilePath: string | null // path to lockfile, detected at startup. null, if no lockfile detected
    }
): Promise<void> {
    const logger = getLogger();

    let backendsToPush: BackendConfig[] = [];

    rsyncAvailable = await rsyncWrapper.rsyncAvailable();
    const isGitRepo = await gitWrapper.isGitRepo(originalCwd);

    if (rePull && rePullHash !== null) {
        await pullBackends(rePullHash, config, lockfilePath);
        return;
    }

    if (await nodeModulesAlreadyExist()) {
        if (!force) {
            throw new NodeModulesAlreadyExistError();
        }

        clearNodeModulesPromise = clearNodeModules();
    } else {
        clearNodeModulesPromise = Promise.resolve();
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
            await install({
                force: true,
                rePull: true,
                rePullHash: hash,
                config,
                lockfilePath
            });
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
    if (rsyncAvailable) {
        return;
    }

    return fsExtra.remove(nodeModules);
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

        const [cacheDirPath] = await Promise.all([
            helpers.createCleanCacheDir(backendConfig),
            helpers.createCleanCwd(lockfilePath),
        ]);

        await backendConfig.backend.pull(hash, backendConfig.options, cacheDirPath);

        logger.info(`Successfully fetched ${hash} from '${backendConfig.alias}'. Unpacking.`);

        await clearNodeModulesPromise;

        const newNodeModules = path.resolve(process.cwd(), 'node_modules');
        helpers.restoreCWD();

        if (rsyncAvailable) {
            await rsyncWrapper.syncDirs(newNodeModules, process.cwd());
        } else {
            await fsExtra.move(newNodeModules, nodeModules);
        }

        logger.info(`Pulled ${hash} from backend '${backendConfig.alias}'`);

        return {missingBackends: config.backends.slice(0, backendIndex)};
    } catch (error) {
        helpers.restoreCWD();

        if (error instanceof errors.BundleNotFoundError) {
            return pullBackends(hash, config, lockfilePath, backendIndex + 1);
        } else {
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
