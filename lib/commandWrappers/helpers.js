'use strict';

const childProcess = require('child_process');

const errors = require('../errors');
const getLogger = require('../logger').getLogger;

class CommandError extends errors.VeendorError {
    constructor(message, output) {
        super(message);
        this.output = output;
    }
}
class CommandTimeoutError extends CommandError {}
class CommandReturnedNonZeroError extends CommandError {}
class CommandWasKilledError extends CommandError {}


module.exports = {
    getOutput: function getOutput(executable, args, {
        timeoutDuration = 0,
        cwd = process.cwd(),
        pipeToParent = false, // If true, every chunk of data will be pushed to stdout or stderr,
                              // like {stdio: 'inherit'}
        collectOutput = true, // If false, getOutput will resolve into empty string,
                              // but you can get actual output through `controlToken.stdio`
        controlToken = {},
    } = {}) {
        return new Promise((resolve, reject) => {
            const commandName = `[${executable} ${args.join(' ')}]`;
            const logger = getLogger();

            let result = '';
            let completed = false;
            let timeout;

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
    },

    CommandError,
    CommandTimeoutError,
    CommandReturnedNonZeroError,
    CommandWasKilledError,
};
