'use strict';

const validateConfig = require('./validateConfig');
const path = require('path');

const version = require('../package.json').version;

module.exports = function resolveConfig(explicitConfig) {
    global.VEENDOR_VERSION = version;

    return new Promise(resolve => {
        let config;
        let configLocations = ['.veendor.js', '.veendor.json'];

        if (explicitConfig) {
            configLocations = [explicitConfig];
        }

        for (const location of configLocations) {
            try {
                config = require(path.resolve(process.cwd(), location));
            } catch (e) {
                if (e.code === 'MODULE_NOT_FOUND' && e.message.indexOf(location) !== -1) {
                    continue;
                }

                throw e;
            }
        }

        if (!config) {
            console.error('Config file not found');
            process.exit(1);
        }

        validateConfig(config).then(() => {
            resolve(config);
        }, error => {
            console.error(error.message);
            process.exit(1);
        });
    });
};
