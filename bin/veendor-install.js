'use strict';

const program = require('commander');
const fs = require('fs');

const install = require('../lib/install');
const resolveConfig = require('../lib/resolveConfig');
const gitWrapper = require('../lib/commandWrappers/gitWrapper');
const logger = require('../lib/logger');

process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);

program
    .description('Download and install node_modules')
    .option('-f, --force', 'overwrite node_modules if it already exists')
    .option('-c --config [configuration-file]')
    .parse(process.argv);

const config = resolveConfig(program.config);
// TODO: add -vvv support
const daLogger = logger.setDefaultLogger(1, 3);

install({force: program.force, config})
    .then(() => {
        // TODO: removing log file
    }, e => {
        if (e instanceof install.NodeModulesAlreadyExistError) {
            return daLogger.error('\'node_modules\' directory already exists. Use -f option to remove it');
        } else if (e instanceof gitWrapper.NotAGitRepoError && config.useGitHistory) {
            return daLogger.error(`'useGitHistory' set in config, but ${process.cwd()} is not a git repo`);
        }

        daLogger.error(e); process.exit(1)
    });

