import _ from 'lodash';
import * as helpers from './helpers';
import {StringMap} from '@/serviceTypes';
import {StdioPolicy} from '@/lib/commandWrappers/helpers';

export function install(packages: StringMap, timeoutDuration = 0) {
    const args = ['install', '--no-save'];

    _.forOwn(packages, (version, pkgname) => {
        args.push(`${pkgname}@${version}`);
    });

    return helpers.getOutput('npm', args, {
        timeoutDuration, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit
    });
}

export function installAll(useCI = false, timeoutDuration = 0) {
    return helpers.getOutput('npm', [useCI ? 'ci' : 'install', '--no-save'], {
        timeoutDuration, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit
    });
}

export function version() {
    return helpers.getOutput('npm', ['--version']);
}

export function uninstall(packages: string[], timeoutDuration = 0) {
    const args = ['uninstall'].concat(packages);

    return helpers.getOutput('npm', args, {
        timeoutDuration, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit
    });
}

export function dedupe(timeoutDuration = 0) {
    return helpers.getOutput('npm', ['dedupe'], {
        timeoutDuration, stdout: StdioPolicy.copy, stderr: StdioPolicy.inherit
    });
}
