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

function notifyAssert(assertion, done) {
    try {
        assertion();
        done();
    } catch (e) {
        done(e);
    }
}

module.exports = {
    fakeBackendConfig,
    notifyAssert
};
