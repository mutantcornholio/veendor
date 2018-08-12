import fsExtra from 'fs-extra';
import path from 'path';
import program from 'commander';

import resolveConfig from '@/lib/resolveConfig';
import * as logger from '@/lib/util/logger';
import resolveLockfile from '@/lib/resolveLockfile';
import {getFSHash} from '@/lib/install/hashGetters';

program
    .description('Calculate and print your bundle id')
    .option('-c --config [configuration-file]')
    .option('--debug', 'don\'t remove .veendor-debug.log')
    .option('-v --verbose', 'Verbose output. Could be from `-v` to `-vvv`', increaseVerbosity, 0)
    .parse(process.argv);

// @ts-ignore
function increaseVerbosity(v, total: number) {
    return total + 1;
}

const daLogger = logger.setDefaultLogger(1, 4 - (program.verbose || 0));

resolveConfig(program.config)
    .then(async (resolvedConfig) => {
        const config = resolvedConfig;
        const lockfilePath = await resolveLockfile();

        const hash = await getFSHash(config, path.resolve(process.cwd(), 'package.json'), lockfilePath);

        console.log(hash.hash);

        if (!(program.debug)) {
            return fsExtra.remove(path.resolve(process.cwd(), '.veendor-debug.log'));
        }

        process.exit(0);
    }).catch(error => {
        daLogger.error(error);
        process.exit(1);
    });
