'use strict';

const childProcess = require('child_process');
const _ = require('lodash');
const helpers = require('./helpers');

module.exports = {
    install: ({packages}) => {
        return new Promise((resolve, reject) => {
            const args = ['--install'];

            _.forOwn(packages, (version, pkgname) => {
                args.push(`${pkgname}@${version}`);
            });

            const proc = childProcess.spawn('npm', args, {stdio: 'inherit'});
            const commandName = `[${executable} ${args.join(' ')}]`;
            let completed = false;

            proc.on('exit', (code, signal) => {
                if (!completed) {
                    if (code === 0) {
                        resolve(result);
                    } else if (code) {
                        reject(new helpers.CommandReturnedNonZeroError(`command ${commandName} returned ${code}`));
                    } else {
                        reject(new helpers.CommandWasKilledError(`command ${commandName} killed with signal ${signal}`));
                    }
                    completed = true;
                }
            });

            proc.on('error', error => {
                if (!completed) {
                    reject(new helpers.CommandError(`command ${commandName} failed: ${error.message}`));
                    completed = true;
                }
            });
        });
    }
};
