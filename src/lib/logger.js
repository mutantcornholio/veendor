'use strict';

const tracer = require('tracer');
const fs = require('fs');
const path = require('path');

let loggerInstance;

module.exports = {
    setLogger,
    setDefaultLogger,
    getLogger
};

function setDefaultLogger(fileLevel, consoleLevel) {
    loggerInstance = tracer.colorConsole({
        format: '{{message}}',
        transport: function (data) {
            if (data.level < fileLevel) {
                return;
            }

            if (data.level >= consoleLevel) {
                console.log(data.output);
            }

            let fileLogString = `${data.timestamp} ${data.title}:\t${data.message}\n`;

            if (data.stack) {
                fileLogString += `${data.stack}\n`;
            }

            fs.appendFileSync(
                './.veendor-debug.log',
                fileLogString
            );
        }
    });

    return loggerInstance;
}

function setLogger(logger) {
    loggerInstance = logger;
}

function getLogger() {
    return loggerInstance;
}
