'use strict';
import AWS from 'aws-sdk';
import {AWSError} from 'aws-sdk/lib/error';
import path from 'path';
import * as tarWrapper from '../commandWrappers/tarWrapper';
import * as errors from '../errors';
import {ControlToken} from '@/lib/commandWrappers/helpers';
import {Compression} from '../commandWrappers/tarWrapper';
import {Readable} from 'stream';
import {BackendToolsProvider} from '@/types';

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

export async function pull(hash: string, options: S3Options, _cachedir: string, toolsProvider: BackendToolsProvider) {
    const s3 = options.__s3;
    const filename = `${hash}.tar${tarWrapper.compression[options.compression]}`;

    let downloadStream: Readable;

    const s3Params = {
        Bucket: options.bucket,
        Key: filename,
    };

    const logger = toolsProvider.getLogger();

    let meta;
    let contentLength;
    try {
        logger.trace('[s3 pull] marking headObject request to S3');
        meta = await s3.headObject(s3Params).promise();
        contentLength = meta.ContentLength;
    } catch (error) {
        if (error.statusCode === 404) {
            throw new errors.BundleNotFoundError();
        } else {
            throw new BundleDownloadError(error.stack);
        }
    }

    logger.trace('[s3 pull] marking getObject request to S3');
    downloadStream = s3.getObject(s3Params).createReadStream();

    const progressStream = toolsProvider.getProgressStream('pull', contentLength);

    const tarWrapperToken: ControlToken = {};
    const extractPromise = new Promise((resolve, reject) => {
        downloadStream.once('readable', () => {
            logger.trace('[s3 pull] downloadStream is readable');
            downloadStream.pipe(progressStream);
            tarWrapper.extractArchiveFromStream(
                progressStream,
                options.compression,
                {controlToken: tarWrapperToken}
            ).then(resolve, reject);
            progressStream.toggleVisibility(true);

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

                progressStream.die();

                if (error.statusCode === 404) {
                    return reject(new errors.BundleNotFoundError());
                }

                reject(new BundleDownloadError(error.message));
            }
        });

        downloadStream.once('end', () => {
            logger.trace('[s3 pull] downloadStream end');
            if (!done) {
                done = true;
                progressStream.die();
                resolve();
            }
        });

        downloadStream.once('close', () => {
            if (!done) {
                done = true;
                progressStream.die();
                resolve();
            }
        });
    });

    return Promise.all([downloadStreamPromise, extractPromise]);
}

export async function push(hash: string, options: S3Options, _cachedir: string, toolsProvider: BackendToolsProvider) {
    const filename = `${hash}.tar${tarWrapper.compression[options.compression]}`;
    const s3 = options.__s3;

    const controlToken: ControlToken = {};

    let bundleExists = false;
    try {
        await s3.headObject({
            Bucket: options.bucket,
            Key: filename,
        }).promise();
        bundleExists = true;
    } catch (error) {
        if (error.statusCode !== 404) {
            throw error;
        }
    }

    if (bundleExists) {
        throw new errors.BundleAlreadyExistsError();
    }

    const progressStream = toolsProvider.getProgressStream('push');
    progressStream.toggleVisibility(true);

    const {stream: tarWrapperStream, promise: tarWrapperPromise} = tarWrapper
        .createStreamArchive([path.resolve(process.cwd(), 'node_modules')], options.compression, {controlToken});

    tarWrapperStream.pipe(progressStream);

    const s3Promise = s3.upload({
        Bucket: options.bucket,
        Key: filename,
        ACL: options.objectAcl,
        Body: progressStream,
    }).promise();

    try {
        await Promise.all([tarWrapperPromise, s3Promise]);
    } catch (error) {
        if (error instanceof errors.VeendorError) {
            throw error;
        }

        throw new BundleUploadError(`${error.statusCode}: ${error.message}`);
    } finally {
        if (controlToken.terminate !== undefined) {
            controlToken.terminate();
        }

        progressStream.die();
    }
}

export class BundleDownloadError extends errors.VeendorError {}
export class BundleUploadError extends errors.VeendorError {}
