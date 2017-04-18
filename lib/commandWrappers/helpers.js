'use strict';

const childProcess = require('child_process');

class CommandError extends Error {}
class CommandTimeoutError extends CommandError {}
class CommandReturnedNonZeroError extends CommandError {}
class CommandWasKilledError extends CommandError {}


module.exports = {
    checkStatus: function checkStatus(executable, args, timeout = 500) {
        return new Promise((resolve, reject) => {
            const commandName = `[${executable} ${args.join(' ')}]`;
            let completed = false;
            const proc = childProcess.spawn(executable, args, {stdio: 'ignore'});

            const timeout = setTimeout(() => {
                if (!completed) {
                    reject(new CommandTimeoutError(
                        `command ${commandName} timed out (${timeout} ms)`)
                    );

                    completed = true;
                }
            }, timeout);


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
