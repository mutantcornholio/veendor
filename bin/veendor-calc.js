'use strict';

const program = require('commander');
const path = require('path');
const fsExtra = require('fs-extra');

const pkgJson = require('../lib/pkgjson');
const resolveConfig = require('../lib/resolveConfig');
const resolveLockfile = require('../lib/resolveLockfile');
const logger = require('../lib/logger');

program
    .description('Calculate and print your bundle id')
    .option('-c --config [configuration-file]')
    .option('--debug', 'don\'t remove .veendor-debug.log')
    .parse(process.argv);

let config;
let lockfileContents;

const daLogger = logger.setDefaultLogger(1, 4);

resolveConfig(program.config)
    .then(resolvedConfig => {
        config = resolvedConfig;

        return resolveLockfile();
    })
    .then(resolvedLockfile => {
        if (resolvedLockfile === null) {
            lockfileContents = null;

            return;
        }

        return fsExtra
            .readFile(path.resolve(process.cwd(), resolvedLockfile))
            .then(lockfileString => lockfileContents = lockfileString);
    })
    .then(() => {
        return fsExtra.readFile(path.resolve(process.cwd(), 'package.json'));
    })
    .then(pkgJson.parsePkgJson)
    .then(parsedPkgJson => {
        console.log(pkgJson.calcHash(parsedPkgJson, lockfileContents, config.packageHash));

        if (!(program.debug)) {
            return fsExtra.remove(path.resolve(process.cwd(), '.veendor-debug.log'));
        }

        process.exit(0);
    }, error => {
        daLogger.error(error);
        process.exit(1);
    });
