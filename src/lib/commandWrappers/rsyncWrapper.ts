import * as helpers from './helpers';

export function syncDirs(from: string, to: string) {
    return helpers.getOutput('rsync', ['-az', '--delete', from, to]);
}

export function rsyncAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
        helpers.getOutput('which', ['rsync'])
            .then(() => resolve(true), () => resolve(false))
    });
}
