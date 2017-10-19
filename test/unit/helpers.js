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


// This class is used as `generic error`,
// if we want to test error propagation
class AnError extends Error {}

module.exports = {
    fakeBackendConfig,
    notifyAssert,
    AnError,
};
