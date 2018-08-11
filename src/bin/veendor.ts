#!/usr/bin/env node
import program from 'commander';
const {version} = require('../../package.json');

program
    .version(version)
    .description('A tool for vendoring your npm dependencies')
    .command('calc', 'calculate and print your bundle id')
    .command('install', 'download and install node_modules')
    .parse(process.argv);
