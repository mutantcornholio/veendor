'use strict';

const program = require('commander');
const path = require('path');
const fs = require('fs');

const pkgJson = require('../lib/pkgjson');
const resolveConfig = require('../lib/resolveConfig');

program
    .description('Calculate and print your bundle id')
    .option('-c --config [configuration-file]')
    .parse(process.argv);

const config = resolveConfig(program.config);
const pkgJsonString = fs.readFileSync(path.resolve(process.cwd(), 'package.json'));
pkgJson
    .parsePkgJson(pkgJsonString)
    .then(parsedPkgJson => {
        console.log(pkgJson.calcHash(parsedPkgJson, config.packageHash));
    }, error => {
        console.error(error);
    });
