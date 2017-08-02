'use strict';

module.exports = {
    backends: [
        {
            alias: 'local-git',
            push: true,
            backend: 'git-lfs',
            options: {
                repo: `${process.env.TEST_REPO_DIR}`
            }
        }
    ]
};
