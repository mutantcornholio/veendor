'use strict';

const childProcess = require('child_process');

const getLogger = require('../logger').getLogger;

class CommandError extends Error {}
class CommandTimeoutError extends CommandError {}
class CommandReturnedNonZeroError extends CommandError {}
class CommandWasKilledError extends CommandError {}


module.exports = {
    getOutput: function getOutput(executable, args, {timeout = 0, cwd = process.cwd()} = {}) {
        return new Promise((resolve, reject) => {
            const commandName = `[${executable} ${args.join(' ')}]`;
            const logger = getLogger();

            let result = '';
            let completed = false;

            logger.debug(`Running ${commandName}`);
            const proc = childProcess.spawn(executable, args, {stdio: 'pipe', cwd});

            if (timeout !== 0) {
                const timeout = setTimeout(() => {
                    if (!completed) {
                        const message = `command ${commandName} timed out (${timeout} ms)`;
                        logger.debug(message);
                        reject(new CommandTimeoutError(message));

                        completed = true;
                    }
                }, timeout);
            }

            proc.stdout.on('data', data => {
                result += data.toString();
            });

            proc.on('exit', (code, signal) => {
                if (!completed) {
                    if (code === 0) {
                        resolve(result);
                    } else if (code) {
                        const message = `command ${commandName} returned ${code}`;
                        logger.debug(message);
                        reject(new CommandReturnedNonZeroError(message));
                    } else {
                        const message = `command ${commandName} killed with signal ${signal}`;
                        logger.debug(message);
                        reject(new CommandWasKilledError(message));
                    }
                    completed = true;
                }
            });

            proc.on('error', error => {
                if (!completed) {
                    const message = `command ${commandName} failed: ${error.message}`;
                    logger.debug(message);
                    reject(new CommandError(message));
                    completed = true;
                }
            });
        });
    },
    /*
     * Same as before, but stdio is inherited, so user will see output
     * and promise resolves with nothing if succeeded
     */
    runInherited: function runInherited(executable, args, {timeout = 0, cwd = process.cwd()} = {}) {
        return new Promise((resolve, reject) => {
            const commandName = `[${executable} ${args.join(' ')}]`;
            const logger = getLogger();

            let completed = false;

            logger.debug(`Running ${commandName}`);
            const proc = childProcess.spawn(executable, args, {stdio: 'inherit', cwd});

            if (timeout !== 0) {
                const timeout = setTimeout(() => {
                    if (!completed) {
                        const message = `command ${commandName} timed out (${timeout} ms)`;
                        logger.debug(message);
                        reject(new CommandTimeoutError(message));

                        completed = true;
                    }
                }, timeout);
            }

            proc.on('exit', (code, signal) => {
                if (!completed) {
                    if (code === 0) {
                        resolve();
                    } else if (code) {
                        const message = `command ${commandName} returned ${code}`;
                        logger.debug(message);
                        reject(new CommandReturnedNonZeroError(message));
                    } else {
                        const message = `command ${commandName} killed with signal ${signal}`;
                        logger.debug(message);
                        reject(new CommandWasKilledError(message));
                    }
                    completed = true;
                }
            });

            proc.on('error', error => {
                if (!completed) {
                    const message = `command ${commandName} failed: ${error.message}`;
                    logger.debug(message);
                    reject(new CommandError(message));
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
