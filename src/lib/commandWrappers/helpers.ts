'use strict';

import childProcess from 'child_process';
import {Writable, Readable} from 'stream';

import * as errors from '../errors';
import {getLogger} from '../util/logger';

export class CommandError extends errors.VeendorError {
    constructor(message: string, public output: string) {
        super(message);
    }
}
export class CommandTimeoutError extends CommandError {}
export class CommandReturnedNonZeroError extends CommandError {}
export class CommandWasKilledError extends CommandError {}

export type ControlToken = {
    terminate?: () => void;
    stdio?: [Writable, Readable, Readable];
}

export enum StdioPolicy {
    inherit, // `process.stdout` or `process.stderr` is gonna be passed to child process.
             // getOutput will not get data from corresponding stream
    copy,    // each line sent stdout/stderr records, to `getOutput` result and sends to
             // `process.stdout` / `process.stderr`
    collect, // only record output to `getOutput` result
    pipe,    // do not record output; corresponding stream will be available at controlToken's stdio
    ignore,  // attach /dev/null to the stream
}

type GetOutputOptions = {
    controlToken?: ControlToken // You can pass an empty object here and it will populate
    // with useful stuff

    timeoutDuration?: number, // Terminate command after x msec

    cwd?: string,

    stdout?: StdioPolicy,
    stderr?: StdioPolicy,
}

function stdioPolicyToCpStdio(policy: StdioPolicy, fd: number): 'ignore' | 'pipe' | number {
    if (policy === StdioPolicy.inherit) {
        return fd;
    } else if (policy === StdioPolicy.ignore) {
        return 'ignore';
    }

    return 'pipe';
}

export function getOutput(executable: string, args: string[], {
    timeoutDuration = 0,
    cwd = process.cwd(),
    controlToken = {},
    stdout = StdioPolicy.collect,
    stderr = StdioPolicy.collect,
}: GetOutputOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const commandName = `[${executable} ${args.join(' ')}]`;
        const logger = getLogger();

        let result = '';
        let completed = false;
        let timeout: NodeJS.Timer;

        logger.debug(`Running ${commandName}; cwd: ${cwd}`);
        const proc = childProcess.spawn(executable, args, {
            stdio: ['pipe', stdioPolicyToCpStdio(stdout, 1), stdioPolicyToCpStdio(stderr, 2)],
            cwd,
        });
        controlToken.terminate = () => {
            logger.debug(`Terminating ${commandName} using control token`);
            proc.kill();
        };

        const deathHand = () => proc.kill();

        process.on('exit', deathHand);

        controlToken.stdio = proc.stdio;

        if (timeoutDuration !== 0) {
            timeout = setTimeout(() => {
                if (!completed) {
                    const message = `command ${commandName} timed out (${timeoutDuration} ms)`;
                    logger.debug(message);
                    reject(new CommandTimeoutError(message, result));

                    completed = true;
                }
            }, timeoutDuration);
        }

        if (stdout === StdioPolicy.collect || stdout === StdioPolicy.copy) {
            proc.stdout.on('data', data => {
                result += data.toString();

                if (stdout === StdioPolicy.copy) {
                    process.stdout.write(data);
                }
            });
        }

        if (stderr === StdioPolicy.collect || stderr === StdioPolicy.copy) {
            proc.stderr.on('data', data => {
                result += data.toString();

                if (stdout === StdioPolicy.copy) {
                    process.stderr.write(data);
                }
            });
        }

        proc.on('exit', (code, signal) => {
            process.removeListener('exit', deathHand);
            if (!completed) {
                if (code === 0) {
                    logger.debug(`Command ${commandName} exited with 0`);
                    resolve(result);
                } else if (code) {
                    const message = `command ${commandName} returned ${code}`;
                    logger.debug(message);
                    reject(new CommandReturnedNonZeroError(message, result));
                } else {
                    const message = `command ${commandName} killed with signal ${signal}`;
                    logger.debug(message);
                    reject(new CommandWasKilledError(message, result));
                }
                clearTimeout(timeout);
                completed = true;
            }
        });

        proc.on('error', error => {
            if (!completed) {
                const message = `command ${commandName} failed: ${error.message}`;
                logger.debug(message);
                reject(new CommandError(message, result));
                clearTimeout(timeout);
                completed = true;
            }
        });
    });
}
