'use strict';

const stream = require('stream');

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

// Simulate AWSError
class AWSError extends Error {
    constructor(message, code, statusCode) {
        super();
        this.message = 'The specified key does not exist.';
        this.statusCode = 404;
        this.code = 'NoSuchKey';
        this.name = code;
    }
}

// A stream to simulate download error
class FailingStream extends stream.Readable {
    constructor(failError = new AnError('read error')) {
        super();
        this.turn = 0;
        this.failError = failError;
    }
    _read() {
        if (this.turn < 5) {
            this.turn++;
            setImmediate(() => {
                this.push('wertyuiopasdfghjk');
            });
        } else {
            this.emit('error', this.failError);
            this.push(null);
        }
    }
}

class SuccessfulStream extends stream.Readable {
    constructor() {
        super();
        this.turn = 0;
    }

    _read() {
        if (this.turn < 5) {
            this.turn++;
            setImmediate(() => {
                this.push('wertyuiopasdfghjk');
            });
        } else {
            this.push(null);
        }
    }
}

class DevNullStream extends stream.Writable {
    _write(chunk, encoding, callback) {
        callback();
    }
}

module.exports = {
    fakeBackendConfig,
    notifyAssert,
    AnError,
    AWSError,
    checkMockResult,
    checkNock,
    expectCalls,
    SuccessfulStream,
    FailingStream,
    DevNullStream,
};
