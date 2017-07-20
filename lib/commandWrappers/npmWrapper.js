'use strict';

const childProcess = require('child_process');
const _ = require('lodash');
const helpers = require('./helpers');

module.exports = {
    install: (packages, timeout = 0) => {
        const args = ['--install'];

        _.forOwn(packages, (version, pkgname) => {
            args.push(`${pkgname}@${version}`);
        });

        return helpers.runInherited('npm', args, {timeout});
    },
    uninstall: (packages, timeout = 0) => {
        const args = ['--uninstall'].concat(packages);

        return helpers.runInherited('npm', args, {timeout});
    }
};
