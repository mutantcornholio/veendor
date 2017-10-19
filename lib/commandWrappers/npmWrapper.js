'use strict';

const _ = require('lodash');
const helpers = require('./helpers');

module.exports = {
    install: (packages, timeout = 0) => {
        const args = ['install'];

        _.forOwn(packages, (version, pkgname) => {
            args.push(`${pkgname}@${version}`);
        });

        return helpers.getOutput('npm', args, {timeout, pipeToParent: true});
    },
    installAll: (timeout = 0) => helpers.getOutput('npm', ['install'], {timeout, pipeToParent: true}),
    uninstall: (packages, timeout = 0) => {
        const args = ['uninstall'].concat(packages);

        return helpers.getOutput('npm', args, {timeout, pipeToParent: true});
    }
};
