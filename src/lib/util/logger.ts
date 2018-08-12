'use strict';

import tracer, {Tracer} from 'tracer';
import fs from 'fs';

let loggerInstance: Tracer.Logger;

export function setDefaultLogger(fileLevel: number, consoleLevel: number) {
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

export function setLogger(logger: Tracer.Logger) {
    loggerInstance = logger;
}

export function getLogger() {
    return loggerInstance;
}
