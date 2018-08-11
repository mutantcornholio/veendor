import validateConfig, {PartialConfig} from './validateConfig';
import path from 'path';
import {Config} from '@/types';

function resolveConfig(explicitConfig: string): Promise<Config> {
    global.VEENDOR_VERSION = require('../../package.json').version;

    return new Promise(resolve => {
        let config;
        let configLocations = ['.veendor.js', '.veendor.json'];

        if (explicitConfig) {
            configLocations = [explicitConfig];
        }

        for (const location of configLocations) {
            try {
                config = <PartialConfig>require(path.resolve(process.cwd(), location));
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

        validateConfig(<PartialConfig>config).then(config => {
            resolve(config);
        }, error => {
            console.error(error.message);
            process.exit(1);
        });
    });
}

export default resolveConfig;
