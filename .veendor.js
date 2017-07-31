'use strict';

const path = require('path');

module.exports = {
    backends: [
        {
            alias: 'local',
            push: true,
            backend: 'local',
            options: {
                directory: path.resolve(process.env.HOME, '.veendor-local')
            }
        },
        {
            alias: 'github',
            push: true,
            backend: 'git-lfs',
            options: {
                repo: 'git@github.com:mutantcornholio/veendor-vendors.git'
            }
        }
    ],
    useGitHistory: {
        depth: 5
    },
    packageHash: {
        suffix: process.platform
    }
};
