'use strict';

module.exports = {
    backends: [
        {
            alias: 'http',
            backend: 'http',
            options: {
                resolveUrl(hash) {
                    return `https://s3.us-east-2.amazonaws.com/mcornholio-s3/${hash}.tar.gz`;
                },
                strict: true,
            }
        }
    ]
};
