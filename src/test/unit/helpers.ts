'use strict';
import fsExtra from 'fs-extra';
import path from 'path';
import stream from 'stream';
import sinon from 'sinon';
import nock from 'nock';

import {getLogger} from '@/lib/util/logger';
import * as wrapperHelpers from '@/lib/commandWrappers/helpers';
import {ProgressStream} from '@/lib/util/progress';
import {BackendConfig} from '@/types';
import {Compression} from '@/lib/commandWrappers/tarWrapper';


export function fakeBackendConfig(alias: string): BackendConfig {
    return {
        alias,
        options: {},
        backend: {
            pull: () => createNodeModules(),
            push: () => Promise.resolve(),
            validateOptions: () => Promise.resolve(),
        }
    }
}

export function createNodeModules(): Promise<void> {
    return fsExtra.ensureDir(path.join(process.cwd(), 'node_modules'))
        .then(() => fsExtra.writeFile(
            path.join(process.cwd(), 'node_modules', 'foobar'),
            'deadbeef'
        ));
}

export function notifyAssert(assertion: () => void, done: (e?: Error) => void) {
    try {
        assertion();
        done();
    } catch (e) {
        done(e);
    }
}

export function checkMockResult(mocks: sinon.SinonMock[], done: (e?: Error) => void, error?: Error) {
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

export function checkNock(scopes: nock.Scope[], done: (err?: Error) => void) {
    try {
        scopes.map(scope => scope.done());
    } catch (error) {
        return done(error);
    }

    done();
}


// This class is used as `generic error`,
// if we want to test error propagation
export class AnError extends Error {}

// Simulate AWSError
export class AWSError extends Error {
    statusCode?: number;
    code: string;
    constructor(_message: string, code: string, _statusCode?: number) {
        super();
        this.message = 'The specified key does not exist.';
        this.statusCode = 404;
        this.code = 'NoSuchKey';
        this.name = code;
    }
}

// A stream to simulate download error
export class FailingStream extends stream.Readable {
    turn: number;
    failError: Error;
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

export class SuccessfulStream extends stream.Readable {
    turn: number;

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

export class DevNullStream extends stream.Writable {
    _write(_chunk: any, _encoding: string, callback: () => void) {
        callback();
    }
}

export function fakeExtractArchiveFromStream(stream: NodeJS.ReadableStream): Promise<string> {
    const allchunks: string[] = [];
    let interval: NodeJS.Timeout;
    return new Promise(resolve => {
        stream.read();
        interval = setInterval(() => {
            const chunk = stream.read();
            if (chunk === null) {
                clearInterval(interval);
                return resolve(allchunks.join());
            } else {
                allchunks.push(chunk.toString());
            }
        }, 10);
    });
}

export function fakeCreateStreamArchive(_inputPaths: string[], _compressionType: Compression, _params: {}): {
    stream: NodeJS.ReadableStream, promise: Promise<string>
} {
    return {
        stream: new SuccessfulStream(),
        promise: Promise.resolve(''),
    };
}

export function mockGetOutput(sandbox: sinon.SinonSandbox) {
    sandbox.stub(wrapperHelpers, 'getOutput').callsFake((executable, args) => {
        const commandName = `[${executable} ${args.join(' ')}]`;

        console.error(`${commandName} is being executed! Looks lile someone doesn't mock the env properly`);
        return Promise.reject(new Error('waaat'));
    });
}

export function makeFakeBackendToolsProvider() {
    return {
        getLogger() {
            return getLogger();
        },

        getProgressStream(label?: string, total?: number) {
            return new ProgressStream({}, label || 'wat', {}, total);
        },
    };
}
