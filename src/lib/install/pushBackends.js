import * as errors from '../errors';
import {getLogger} from '../logger';
import helpers from './helpers';

module.exports = function pushBackends(backends, hash, config, rePull) {
    const logger = getLogger();
    logger.trace(`Pushing '${hash}' to backends`);

    const pushingBackends = backends.filter(backend => backend.push === true);

    if (pushingBackends.length === 0) {
        logger.info(`No backends with push: true found. Exiting`);
    }

    const dirPromises = pushingBackends.map(backend => {
        return helpers.createCleanCacheDir(backend);
    });

    return Promise.all(dirPromises)
        .then((cacheDirs) => {
            const pushingPromises = [];

            for (const [index, backend] of pushingBackends.entries()) {
                logger.info(`Pushing '${hash}' to '${backend.alias}' backend`);

                if (backend.pushMayFail) {
                    pushingPromises.push(
                        backend.backend
                            .push(hash, backend.options, cacheDirs[index])
                            .then(res => {
                                logger.info(`Pushing ${hash}' to '${backend.alias}' backend completed succsessfully`);
                                return res;
                            }, error => logger.warn(error))
                    );
                } else {
                    pushingPromises.push(backend.backend.push(hash, backend.options, cacheDirs[index])
                        .then(res => {
                            logger.info(`Pushing ${hash}' to '${backend.alias}' backend completed succsessfully`);
                            return res;
                        }));
                }
            }

            return Promise.all(pushingPromises);
        })
        .then(result => {
            logger.debug('Pushing to all backends completed succsessfully');
            return result;
        }, error => {
            if (error instanceof errors.BundleAlreadyExistsError) {
                if (!rePull) {
                    const message = `Bundle '${hash}' already exists in remote repo! Re-pulling it`;
                    logger.error(message);
                    throw new errors.RePullNeeded(message);
                }
            }

            throw error;
        });
};
