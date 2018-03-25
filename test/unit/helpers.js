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

function checkMockResult(mocks, done, error) {
    if (error && error.name === 'ExpectationError') {
        return done(error);
    }

    try {
        mocks.map(mock => mock.verify());
    } catch (error) {
        return done(error);
    }

    done();
}

function checkNock(scopes, done) {
    try {
        scopes.map(scope => scope.done());
    } catch (error) {
        return done(error);
    }

    done();
}


function expectCalls(expectPairs, done) {
    for (const expect of expectPairs) {
        if (!expect.spy.calledWith(...expect.args)) {
            return done(new Error(`Expected spy "${expect.spy.displayName}" ` +
                `to be called with [${expect.args.join(', ')}]\n` +
                `Actual calls were: [${expect.spy.getCalls().join(', ')}]`))
        }
    }

    done();
}

// This class is used as `generic error`,
// if we want to test error propagation
class AnError extends Error {}

module.exports = {
    fakeBackendConfig,
    notifyAssert,
    AnError,
    checkMockResult,
    checkNock,
    expectCalls,
};
