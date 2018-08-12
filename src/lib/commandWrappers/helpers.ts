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

type GetOutputOptions = {
    controlToken?: ControlToken // You can pass an empty object here and it will populate
    // with useful stuff

    timeoutDuration?: number, // Terminate command after x msec

    cwd?: string,

    pipeToParent?: boolean,  // If true, every chunk of data will be pushed to stdout or stderr,
    // like {stdio: 'inherit'}

    collectOutput?: boolean, // If false, getOutput will resolve into empty string,
                             // but you can get actual output through `controlToken.stdio`
}

export function getOutput(executable: string, args: string[], {
    timeoutDuration = 0, cwd = process.cwd(), pipeToParent = false, collectOutput = true, controlToken = {},
}: GetOutputOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        const commandName = `[${executable} ${args.join(' ')}]`;
        const logger = getLogger();

        let result = '';
        let completed = false;
        let timeout: NodeJS.Timer;

        logger.debug(`Running ${commandName}; cwd: ${cwd}`);
        const proc = childProcess.spawn(executable, args, {stdio: 'pipe', cwd});
        controlToken.terminate = () => {
            logger.debug(`Terminating ${commandName} using control token`);
            proc.kill()
        };

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

        if (collectOutput) {
            proc.stdout.on('data', data => {
                result += data.toString();

                if (pipeToParent) {
                    process.stdout.write(data);
                }
            });

            proc.stderr.on('data', data => {
                result += data.toString();

                if (pipeToParent) {
                    process.stderr.write(data);
                }
            });
        }

        proc.on('exit', (code, signal) => {
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
