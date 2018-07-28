'use strict';

const path = require('path');
const http = require('http');
const https = require('https');
const fsExtra = require('fs-extra');
const url = require('url');

const tarWrapper = require('../commandWrappers/tarWrapper');
const errors = require('../errors');

function validateOptions(options) {
    if (options.compression && !(options.compression in tarWrapper.compression)) {
        throw new errors.InvalidOptionsError(`Invalid compression: ${options.compression}`);
    }

    if (!options.compression) {
        options.compression = 'gzip';
    }

    if (!options.resolveUrl) {
        throw new errors.InvalidOptionsError('`resolveUrl` function must be provided');
    }

    if (!options.strict) {
        options.strict = false;
    }
}

function pull(hash, options, cacheDir) {
    let resolvedUrlPromise = options.resolveUrl(hash);
    const archivePath = path.join(cacheDir, `${hash}.tar${tarWrapper.compression[options.compression]}`);

    if (!(resolvedUrlPromise instanceof Promise)) {
        resolvedUrlPromise = Promise.resolve(resolvedUrlPromise);
    }

    return resolvedUrlPromise
        .then(resolvedUrl => {
            return new Promise((resolve, reject) => {
                const parsedUrl = url.parse(resolvedUrl);
                let transport;
                let done = false;

                if (parsedUrl.protocol === 'http:') {
                    transport = http;
                } else if (parsedUrl.protocol === 'https:') {
                    transport = https;
                } else {
                    done = true;
                    return reject(new InvalidProtocolError(
                        `http backend can't work with \`${parsedUrl.protocol}\` protocol. ` +
                        `Only \`http:\` and \`https:\` are supported`
                    ));
                }

                transport.get(parsedUrl.href, res => {
                    if (res.statusCode === 404) {
                        done = true;
                        
                        return reject(new errors.BundleNotFoundError);
                    } else if (res.statusCode !== 200) {
                        done = true;
                        
                        if (options.strict) {
                            return reject(new InvalidStatusCodeError(
                                `Request to \'${parsedUrl}\' failed. Invalid status code: \`${res.statusCode}\``
                            ));
                        }

                        return reject(new errors.BundleNotFoundError);
                    }
                    const tarWrapperToken = {};

                    tarWrapper.extractArchiveFromStream(res, {controlToken: tarWrapperToken});

                    res.on('end', () => {
                        if (done) {
                            return;
                        }

                        done = true;
                        resolve();
                    });
                    
                    res.on('error', error => {
                        if (done) {
                            return;
                        }

                        done = true;

                        if (tarWrapperToken.terminate) {
                            tarWrapperToken.terminate();
                        }

                        if (options.strict) {
                            return reject(new BundleDownloadError(error));
                        }

                        return reject(new errors.BundleNotFoundError(error));
                    })
                });
            });
        });
}

class InvalidProtocolError extends errors.VeendorError {}
class InvalidStatusCodeError extends errors.VeendorError {}
class BundleDownloadError extends errors.VeendorError {}

module.exports = {
    validateOptions,
    pull,
    push() {
        throw new errors.VeendorError('`http` backend is read-only, pushing is not implemented');
    },
    InvalidProtocolError,
    InvalidStatusCodeError,
    BundleDownloadError,
};
