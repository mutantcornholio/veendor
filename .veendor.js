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
            alias: 's3',
            push: true,
            backend: 's3',
            options: {
                bucket: 'mcornholio-s3',
            }
        },
        {
            alias: 'github',
            push: true,
            backend: 'git-lfs',
            options: {
                checkLfsAvailability: true,
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
