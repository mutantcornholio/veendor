'use strict';


function fakeBackendConfig(alias) {
    return {
        alias,
        options: {},
        backend: {
            pull: () => Promise.resolve(),
            push: () => Promise.resolve(),
            validateOptions: () => {},
        }
    }
}

module.exports = {
    fakeBackendConfig
};
