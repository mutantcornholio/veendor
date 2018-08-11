#!/usr/bin/env node
const program = require('commander');
const version = require('../../package.json').version;

program
    .version(version)
    .description('A tool for vendoring your npm dependencies')
    .command('calc', 'calculate and print your bundle id')
    .command('install', 'download and install node_modules')
    .parse(process.argv);
