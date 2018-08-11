'use strict';

const helpers = require('./helpers');

function syncDirs(from, to) {
    return helpers.getOutput('rsync', ['-az', '--delete', from, to]);
}

function rsyncAvailable() {
    return new Promise((resolve) => {
        helpers.getOutput('which', ['rsync'])
            .then(() => resolve(true), () => resolve(false))
    });
}

module.exports = {
    syncDirs,
    rsyncAvailable,
};
