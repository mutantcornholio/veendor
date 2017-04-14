'use strict';

const program = require('commander');

program
    .description('Download and install node_modules')
    .option('-f, --force', 'overwrite node_modules if it already exists')
    .parse(process.argv);
