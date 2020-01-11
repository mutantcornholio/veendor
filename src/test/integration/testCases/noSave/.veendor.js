'use strict';

module.exports = {
    backends: [
        {
            alias: 'local',
            push: true,
            backend: 'local',
            options: {
                directory: `${process.env.TEST_DIR}`
            }
        }
    ],
    useGitHistory: {
        depth: 15,
    },
};
