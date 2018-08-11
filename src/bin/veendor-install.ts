import path from 'path';
import fsExtra from 'fs-extra';
import program from 'commander';

import resolveConfig from '@/lib/resolveConfig';
import * as logger from '@/lib/logger';
import * as gitWrapper from '@/lib/commandWrappers/gitWrapper';
import resolveLockfile from '@/lib/resolveLockfile';
import install, {NodeModulesAlreadyExistError} from '@/lib/install';
import {Config} from '@/types';

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

program
    .description('Download and install node_modules')
    .option('-f, --force', 'overwrite node_modules if it already exists')
    .option('-c --config [configuration-file]')
    .option('--debug', 'don\'t remove .veendor-debug.log')
    .option('-v --verbose', 'Verbose output. Could be from `-v` to `-vvv`', increaseVerbosity, 0)
    .parse(process.argv);

// @ts-ignore
function increaseVerbosity(v, total: number) {
    return total + 1;
}

const daLogger = logger.setDefaultLogger(1, 3 - (program.verbose || 0));

let config: Config;

resolveConfig(program.config)
    .then(async (resolvedConfig) => {
        config = resolvedConfig;
        const lockfilePath = await resolveLockfile();

        await install({force: Boolean(program.force), config, lockfilePath, rePull: false, rePullHash: null});

        if (!(program.debug)) {
            await fsExtra.remove(path.resolve(process.cwd(), '.veendor-debug.log'));
        }
    })
    .catch(e => {
        if (e instanceof NodeModulesAlreadyExistError) {
            daLogger.error('\'node_modules\' directory already exists. Use -f option to overwrite');
            return;
        } else if (e instanceof gitWrapper.NotAGitRepoError && config.useGitHistory) {
            daLogger.error(`'useGitHistory' set in config, but ${process.cwd()} is not a git repo`);
            return;
        }

        daLogger.error(e); process.exit(1)
    });

