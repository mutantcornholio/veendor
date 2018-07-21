'use strict';

const program = require('commander');
const fsExtra = require('fs-extra');
const path = require('path');

const install = require('../lib/install');
const resolveConfig = require('../lib/resolveConfig');
const resolveLockfile = require('../lib/resolveLockfile');
const gitWrapper = require('../lib/commandWrappers/gitWrapper');
const logger = require('../lib/logger');

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

program
    .description('Download and install node_modules')
    .option('-f, --force', 'overwrite node_modules if it already exists')
    .option('-c --config [configuration-file]')
    .option('--debug', 'don\'t remove .veendor-debug.log')
    .option('-v --verbose', 'Verbose output. Could be from `-v` to `-vvv`', increaseVerbosity, 0)
    .parse(process.argv);

function increaseVerbosity(v, total) {
    return total + 1;
}

const daLogger = logger.setDefaultLogger(1, 3 - program.verbose);

let config;

resolveConfig(program.config)
    .then(resolvedConfig => {
        config = resolvedConfig;

        return resolveLockfile();
    })
    .then(lockfile => {
        return install({force: program.force, config, lockfile});
    })
    .then(() => {
        if (!(program.debug)) {
            return fsExtra.remove(path.resolve(process.cwd(), '.veendor-debug.log'));
        }
    }, e => {
        if (e instanceof install.NodeModulesAlreadyExistError) {
            return daLogger.error('\'node_modules\' directory already exists. Use -f option to overwrite');
        } else if (e instanceof gitWrapper.NotAGitRepoError && config.useGitHistory) {
            return daLogger.error(`'useGitHistory' set in config, but ${process.cwd()} is not a git repo`);
        }

        daLogger.error(e); process.exit(1)
    });

