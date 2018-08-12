'use strict';
const fsExtra = require('fs-extra');
const path = require('path');
const stream = require('stream');

const {getLogger} = require('@/lib/logger');
const wrapperHelpers = require('@/lib/commandWrappers/helpers');

function fakeBackendConfig(alias) {
    return {
        alias,
        options: {},
        backend: {
            pull: () => createNodeModules(),
            push: () => Promise.resolve(),
            validateOptions: () => {},
        }
    }
}

function createNodeModules() {
    return fsExtra.ensureDir(path.join(process.cwd(), 'node_modules'))
        .then(() => fsExtra.writeFile(
            path.join(process.cwd(), 'node_modules', 'foobar'),
            'deadbeef'
        ));
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

function fakeExtractArchiveFromStream(stream) {
    const allchunks = [];
    let interval;
    return new Promise(resolve => {
        stream.read();
        interval = setInterval(() => {
            const chunk = stream.read();
            if (chunk === null) {
                clearInterval(interval);
                return resolve(allchunks);
            } else {
                allchunks.push(chunk.toString());
            }
        }, 10);
    });
}

function fakeCreateStreamArchive(inputPaths, compressionType, {controlToken = {}}) {
    return {
        stream: new SuccessfulStream(),
        promise: Promise.resolve(),
    };
}

function mockGetOutput(sandbox) {
    sandbox.stub(wrapperHelpers, 'getOutput').callsFake((executable, args) => {
        const commandName = `[${executable} ${args.join(' ')}]`;

        console.error(`${commandName} is being executed! Looks lile someone doesn't mock the env properly`);
        return Promise.reject(new Error('waaat'));
    });
}

module.exports = {
    fakeBackendConfig,
    createNodeModules,
    notifyAssert,
    AnError,
    AWSError,
    checkMockResult,
    checkNock,
    expectCalls,
    SuccessfulStream,
    FailingStream,
    DevNullStream,
    fakeExtractArchiveFromStream,
    fakeCreateStreamArchive,
    mockGetOutput,
};
