'use strict';

const childProcess = require('child_process');

class CommandError extends Error {}
class CommandTimeoutError extends CommandError {}
class CommandReturnedNonZeroError extends CommandError {}
class CommandWasKilledError extends CommandError {}


module.exports = {
    getOutput: function getOutput(executable, args, {timeout = 0}) {
        return new Promise((resolve, reject) => {
            const commandName = `[${executable} ${args.join(' ')}]`;

            let result = '';
            let completed = false;

            const proc = childProcess.spawn(executable, args, {stdio: 'ignore'});

            if (timeout !== 0) {
                const timeout = setTimeout(() => {
                    if (!completed) {
                        reject(new CommandTimeoutError(`command ${commandName} timed out (${timeout} ms)`));

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
                        reject(new CommandReturnedNonZeroError(`command ${commandName} returned ${code}`));
                    } else {
                        reject(new CommandWasKilledError(`command ${commandName} killed with signal ${signal}`));
                    }
                    completed = true;
                }
            });

            proc.on('error', error => {
                if (!completed) {
                    reject(new CommandError(`command ${commandName} failed: ${error.message}`));
                    completed = true;
                }
            });
        });
    },
    /*
     * Same as before, but stdio is inherited, so user will see output
     * and promise resolves with nothing if succeeded
     */
    runInherited: function runPiped(executable, args, {timeout = 0, cwd=process.cwd()}) {
        return new Promise((resolve, reject) => {
            const commandName = `[${executable} ${args.join(' ')}]`;

            let completed = false;

            const proc = childProcess.spawn(executable, args, {stdio: 'inherit', cwd});

            if (timeout !== 0) {
                const timeout = setTimeout(() => {
                    if (!completed) {
                        reject(new CommandTimeoutError(`command ${commandName} timed out (${timeout} ms)`));

                        completed = true;
                    }
                }, timeout);
            }

            proc.on('exit', (code, signal) => {
                if (!completed) {
                    if (code === 0) {
                        resolve();
                    } else if (code) {
                        reject(new CommandReturnedNonZeroError(`command ${commandName} returned ${code}`));
                    } else {
                        reject(new CommandWasKilledError(`command ${commandName} killed with signal ${signal}`));
                    }
                    completed = true;
                }
            });

            proc.on('error', error => {
                if (!completed) {
                    reject(new CommandError(`command ${commandName} failed: ${error.message}`));
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
