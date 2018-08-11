import _ from 'lodash';
import * as helpers from './helpers';
import {StringMap} from '@/serviceTypes';

export function install(packages: StringMap, timeoutDuration = 0) {
    const args = ['install'];

    _.forOwn(packages, (version, pkgname) => {
        args.push(`${pkgname}@${version}`);
    });

    return helpers.getOutput('npm', args, {timeoutDuration, pipeToParent: true});
}

export function installAll(timeoutDuration = 0) {
    return helpers.getOutput('npm', ['install'], {timeoutDuration, pipeToParent: true});
}

export function version() {
    return helpers.getOutput('npm', ['--version']);
}

export function uninstall(packages: string[], timeoutDuration = 0) {
    const args = ['uninstall'].concat(packages);

    return helpers.getOutput('npm', args, {timeoutDuration, pipeToParent: true});
}
