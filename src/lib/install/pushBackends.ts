import * as errors from '../errors';
import {getLogger} from '../logger';
import helpers from './helpers';
import {BackendConfig} from '@/types';

export default async function pushBackends(
    backendConfigs: BackendConfig[], hash: string, rePull: boolean): Promise<void> {
    const logger = getLogger();
    logger.trace(`Pushing '${hash}' to backends`);

    const pushingBackends = backendConfigs.filter(backend => backend.push);

    if (pushingBackends.length === 0) {
        logger.info(`No backends with push: true found. Exiting`);
    }

    const dirPromises = pushingBackends.map(backend => {
        return helpers.createCleanCacheDir(backend);
    });

    const cacheDirs = await Promise.all(dirPromises);

    const pushingPromises = [];

    for (const [index, backend] of pushingBackends.entries()) {
        logger.info(`Pushing '${hash}' to '${backend.alias}' backend`);

        let promise = backend.backend
            .push(hash, backend.options, cacheDirs[index])
            .then(() => {
                logger.info(`Pushing ${hash}' to '${backend.alias}' backend completed succsessfully`);
            });

        if (backend.pushMayFail) {
            promise = promise.catch((error: Error) => {logger.warn(error)});
        }

        pushingPromises.push(promise);
    }

    try {
        await Promise.all(pushingPromises);
    } catch (error) {
        if (error instanceof errors.BundleAlreadyExistsError) {
            if (!rePull) {
                const message = `Bundle '${hash}' already exists in remote repo! Re-pulling it`;
                logger.error(message);
                throw new errors.RePullNeeded(message);
            }
        }

        throw error;
    }

    logger.debug('Pushing to all backends completed succsessfully');
};
