const errors = require('../errors');
const getLogger = require('../logger').getLogger;
const helpers = require('./helpers');

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
                            .catch(error => logger.warn(error))
                    );
                } else {
                    pushingPromises.push(backend.backend.push(hash, backend.options, cacheDirs[index]));
                }
            }

            return Promise.all(pushingPromises);
        })
        .then(result => result, error => {
            if (error instanceof errors.BundleAlreadyExistsError) {
                if (!rePull) {
                    logger.error(`Bundle '${hash}' already exists in remote repo! Re-pulling it`);
                    throw new errors.RePullNeeded();
                }
            }

            throw error;
        });
};
