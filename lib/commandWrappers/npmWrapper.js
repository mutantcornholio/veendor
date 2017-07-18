'use strict';

const childProcess = require('child_process');
const _ = require('lodash');
const helpers = require('./helpers');

function onExit({commandName, completed, resolve, reject}) {
    return (code, signal) => {
        if (!completed) {
            if (code === 0) {
                resolve(result);
            } else if (code) {
                reject(new helpers.CommandReturnedNonZeroError(`command ${commandName} returned ${code}`));
            } else {
                reject(new helpers.CommandWasKilledError(`command ${commandName} killed with signal ${signal}`));
            }
        }
    }
}

function onError({commandName, completed, reject}) {
    return (error) => {
        if (!completed) {
            reject(new helpers.CommandError(`command ${commandName} failed: ${error.message}`));
        }
    }
}

module.exports = {
    install: (packages) => {
        return new Promise((resolve, reject) => {
            const args = ['--install'];

            _.forOwn(packages, (version, pkgname) => {
                args.push(`${pkgname}@${version}`);
            });

            const proc = childProcess.spawn('npm', args, {stdio: 'inherit'});
            const commandName = `[${executable} ${args.join(' ')}]`;
            let completed = false;

            proc.on('exit', onExit({commandName, completed, resolve, reject}));
            proc.on('exit', () => {completed = true});

            proc.on('error', onError({commandName, completed, reject}));
            proc.on('error', () => {completed = true});
        });
    },
    uninstall: (packages) => {
        return new Promise((resolve, reject) => {
            const args = ['--uninstall'].concat(packages);

            const proc = childProcess.spawn('npm', args, {stdio: 'inherit'});
            const commandName = `[${executable} ${args.join(' ')}]`;
            let completed = false;

            proc.on('exit', onExit({commandName, completed, resolve, reject}));
            proc.on('exit', () => {completed = true});

            proc.on('error', onError({commandName, completed, reject}));
            proc.on('error', () => {completed = true});
        });
    }
};
