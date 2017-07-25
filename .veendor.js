'use strict';

module.exports = {
    backends: [
        {
            alias: 'github',
            push: true,
            backend: require('/Users/cornholio/dev/veendor/lib/backends/git-lfs'),
            options: {
                repo: 'git@github.com:mutantcornholio/veendor-vendors.git'
            }
        }
    ]
};
