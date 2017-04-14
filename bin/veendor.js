var program = require('commander');

program
    .version('0.0.0')
    .description('A tool for vendoring your npm dependencies')
    .command('calc', 'calculate and print your bundle id')
    .command('install', 'download and install node_modules')
    .parse(process.argv);
