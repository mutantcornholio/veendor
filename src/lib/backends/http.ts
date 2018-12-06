import http from 'http';
import https from 'https';
import url from 'url';
import * as tarWrapper from '../commandWrappers/tarWrapper';
import * as errors from '../errors';
import {Compression} from '@/lib/commandWrappers/tarWrapper';
import {ControlToken} from '@/lib/commandWrappers/helpers';
import {BackendToolsProvider} from '@/types';


type HttpOptions = {
    compression: Compression,
    resolveUrl: (hash: string) => string | Promise<string>,
    strict: boolean,
}

type Transport = {
    get(options: http.RequestOptions | string | URL, callback?: (res: http.IncomingMessage) => void): http.ClientRequest;
}

export function validateOptions(options: Partial<HttpOptions>) {
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

export async function pull(hash: string, options: HttpOptions, _cachedir: string, toolsProvider: BackendToolsProvider) {
    let resolvedUrlPromise = options.resolveUrl(hash);

    if (!(resolvedUrlPromise instanceof Promise)) {
        resolvedUrlPromise = Promise.resolve(resolvedUrlPromise);
    }

    const resolvedUrl = await resolvedUrlPromise;

        const parsedUrl = url.parse(resolvedUrl);
        let done = false;

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            done = true;

            throw new InvalidProtocolError(
                `http backend can't work with \`${parsedUrl.protocol}\` protocol. ` +
                `Only \`http:\` and \`https:\` are supported`
            );
        }

        const transport: Transport = parsedUrl.protocol === 'https:' ? https : http;

        if (typeof parsedUrl.href !== 'string') {
            done = true;
            throw new InvalidUrlError(`${parsedUrl.href} is not a valid URL`);
        }

        const href = parsedUrl.href;

        return new Promise((resolve, reject) => {
            transport.get(href, res => {
                if (res.statusCode === 404) {
                    done = true;

                    reject(new errors.BundleNotFoundError());
                    return;
                } else if (res.statusCode !== 200) {
                    if(done) {
                        return;
                    }

                    done = true;
                    if (options.strict) {
                        reject(new InvalidStatusCodeError(
                            `Request to \'${parsedUrl}\' failed. Invalid status code: \`${res.statusCode}\``
                        ));
                        return;
                    }

                    reject(new errors.BundleNotFoundError());
                    return;
                }


                const contentLengthHeader = res.headers['content-length'];
                const contentLength = typeof contentLengthHeader === 'string' ?
                    (parseInt(contentLengthHeader, 10)) : undefined;

                const progressStream = toolsProvider.getProgressStream('pull', contentLength);

                res.pipe(progressStream);

                progressStream.toggleVisibility(true);

                const tarWrapperToken: ControlToken = {};
                tarWrapper.extractArchiveFromStream(
                    progressStream,
                    options.compression,
                    {controlToken: tarWrapperToken}
                )
                    .then(() => {
                        if (!done) {
                            resolve();
                            done = true;
                        }
                    }, (error: Error) => {
                        if (!done) {
                            reject(error);
                            done = true;
                        }
                    });

                res.on('error', (error: Error) => {
                    if (done) {
                        return;
                    }

                    done = true;

                    if (tarWrapperToken.terminate) {
                        tarWrapperToken.terminate();
                    }

                    if (options.strict) {
                        return reject(new BundleDownloadError(error.stack));
                    }

                    return reject(new errors.BundleNotFoundError(error.stack));
                })

            });

        });
}

export class InvalidUrlError extends errors.VeendorError {}
export class InvalidProtocolError extends errors.VeendorError {}
export class InvalidStatusCodeError extends errors.VeendorError {}
export class BundleDownloadError extends errors.VeendorError {}

export function push() {
    throw new errors.VeendorError('`http` backend is read-only, pushing is not implemented');
}
