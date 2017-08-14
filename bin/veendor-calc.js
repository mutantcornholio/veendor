'use strict';

const program = require('commander');
const path = require('path');
const fsExtra = require('fs-extra');

const pkgJson = require('../lib/pkgjson');
const resolveConfig = require('../lib/resolveConfig');

program
    .description('Calculate and print your bundle id')
    .option('-c --config [configuration-file]')
    .parse(process.argv);

let config;

resolveConfig(program.config)
    .then(resolvedConfig => {
        config = resolvedConfig;
        return fsExtra.readFile(path.resolve(process.cwd(), 'package.json'));
    })
    .then(pkgJson.parsePkgJson)
    .then(parsedPkgJson => {
        console.log(pkgJson.calcHash(parsedPkgJson, config.packageHash));
    }, error => {
        console.error(error);
    });
