'use strict';

module.exports = {
    backends: [
        {
            backend: {
                pull: () => Promise.resolve(),
                push: () => Promise.resolve(),
            }
        }
    ]
};
