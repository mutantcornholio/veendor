'use strict';

const validateConfig = require('./validateConfig');
const path = require('path');

module.exports = function resolveConfig(explicitConfig) {
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

    try {
        validateConfig(config);
    } catch (e) {
        console.error(`Config file is invalid: ${e.message}`);
        process.exit(1);
    }

    return config;
};
