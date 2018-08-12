'use strict';
import AWS from 'aws-sdk';
import {AWSError} from 'aws-sdk/lib/error';
import path from 'path';
import * as tarWrapper from '../commandWrappers/tarWrapper';
import * as errors from '../errors';
import {ControlToken} from '@/lib/commandWrappers/helpers';
import {Compression} from '../commandWrappers/tarWrapper';
import {ProgressStream} from '@/lib/install/helpers';
import {Readable} from 'stream';

type S3Options = {
    compression: Compression,
    bucket: string,
    objectAcl: string,
    s3Options: {
        apiVersion: string,
    },
    __s3: AWS.S3,
}

export function validateOptions(options: Partial<S3Options>) {
    if (options.compression && !(options.compression in tarWrapper.compression)) {
        throw new errors.InvalidOptionsError(`Invalid compression: ${options.compression}`);
    }

    if (!options.compression) {
        options.compression = 'gzip';
    }

    if (!options.bucket) {
        throw new errors.InvalidOptionsError('`bucket` option must be provided');
    }

    if (!options.objectAcl) {
        options.objectAcl = 'public-read';
    }

    const forcedS3Options = {apiVersion: '2006-03-01'};

    if (!options.s3Options) {
        options.s3Options = forcedS3Options;
    } else {
        Object.assign(options.s3Options, forcedS3Options);
    }
    options.__s3 = new AWS.S3(options.s3Options);
}

export async function pull(hash: string, options: S3Options) {
    const s3 = options.__s3;
    const filename = `${hash}.tar${tarWrapper.compression[options.compression]}`;

    let downloadStream: Readable;

    const s3Params = {
        Bucket: options.bucket,
        Key: filename,
    };

    let meta;
    let contentLength;
    try {
        meta = await s3.headObject(s3Params).promise();
        contentLength = meta.ContentLength;
    } catch (error) {
        if (error.statusCode === 404) {
            throw new errors.BundleNotFoundError();
        } else {
            throw new BundleDownloadError(error.message);
        }
    }

    downloadStream = s3.getObject(s3Params).createReadStream();

    const progressStream = new ProgressStream({}, 's3 pull', contentLength);

    const tarWrapperToken: ControlToken = {};
    const extractPromise = new Promise((resolve, reject) => {
        downloadStream.once('readable', () => {
            downloadStream.pipe(progressStream);
            tarWrapper.extractArchiveFromStream(progressStream, {controlToken: tarWrapperToken}).then(resolve, reject);
        })
    });

    const downloadStreamPromise = new Promise((resolve, reject) => {
        let done = false;

        downloadStream.once('error', (error: AWSError) => {
            if (!done) {
                done = true;

                if (tarWrapperToken.terminate) {
                    tarWrapperToken.terminate();
                }

                if (error.statusCode === 404) {
                    return reject(new errors.BundleNotFoundError());
                }

                reject(new BundleDownloadError(error.message));
            }
        });

        downloadStream.once('end', () => {
            if (!done) {
                done = true;
                resolve();
            }
        });

        downloadStream.once('close', () => {
            if (!done) {
                done = true;
                resolve();
            }
        });
    });

    return Promise.all([downloadStreamPromise, extractPromise]);
}

export function push(hash: string, options: S3Options) {
    const filename = `${hash}.tar${tarWrapper.compression[options.compression]}`;
    const s3 = options.__s3;

    const controlToken: ControlToken = {};

    const {stream, promise} = tarWrapper
        .createStreamArchive([path.resolve(process.cwd(), 'node_modules')], options.compression, {controlToken});

    const progressStream = new ProgressStream({}, 's3 push');
    stream.pipe(progressStream);
    return s3.headObject({
        Bucket: options.bucket,
        Key: filename,
    }).promise()
        .then(() => {
            throw new errors.BundleAlreadyExistsError();
        }, error => {
            if (error.statusCode === 404) {
                return s3.upload({
                    Bucket: options.bucket,
                    Key: filename,
                    ACL: options.objectAcl,
                    Body: progressStream,
                }).promise().then(() => promise);
            }

            throw error;
        })
        .catch(error => {
            if (controlToken.terminate !== undefined) {
                controlToken.terminate();
            }

            if (error instanceof errors.VeendorError) {
                throw error;
            }

            throw new BundleUploadError(`${error.statusCode}: ${error.message}`);
        });
}

export class BundleDownloadError extends errors.VeendorError {}
export class BundleUploadError extends errors.VeendorError {}
