'use strict';

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const tarWrapper = require('../commandWrappers/tarWrapper');
const errors = require('../errors');

function validateOptions(options) {
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

    if (!options.s3Options) {
        options.s3Options = {};
    }

    options.s3Options.apiVersion = '2006-03-01';

    options.__s3 = new AWS.S3(options.s3Options);
}

function pull(hash, options, cacheDir) {
    let archivePath;
    return new Promise((resolve, reject) => {
        let done = false;
        const s3 = options.__s3;
        const filename = `${hash}.tar${tarWrapper.compression[options.compression]}`;
        archivePath = path.join(cacheDir, filename);

        const writeStream = fs.createWriteStream(archivePath);

        const downloadStream = s3.getObject({
            Bucket: options.bucket,
            Key: filename,
        }).createReadStream();

        downloadStream.pipe(writeStream);

        downloadStream.on('error', error => {
            if (!done) {
                done = true;

                if (error.statusCode === 404) {
                    return reject(new errors.BundleNotFoundError());
                }

                reject(new BundleDownloadError(error.message));
            }
        });

        downloadStream.on('end', error => {
            if (!done) {
                done = true;
                resolve();
            }
        });

        downloadStream.on('close', error => {
            if (!done) {
                done = true;
                resolve();
            }
        });
    })
        .then(() => {
            return tarWrapper.extractArchive(archivePath);
        });
}

function push(hash, options, cacheDir) {
    const filename = `${hash}.tar${tarWrapper.compression[options.compression]}`;
    const archivePath = path.join(cacheDir, filename);
    const s3 = options.__s3;

    return tarWrapper
        .createArchive(archivePath, [path.resolve(process.cwd(), 'node_modules')], options.compression)
        .then(() => {
            return s3.headObject({
                Bucket: options.bucket,
                Key: filename,
            }).promise();
        })
        .then(() => {
            throw new errors.BundleAlreadyExistsError();
        }, error => {
            if (error.statusCode === 404) {
                const archiveStream = fs.createReadStream(archivePath);

                return s3.upload({
                    Bucket: options.bucket,
                    Key: filename,
                    ACL: options.objectAcl,
                    Body: archiveStream,
                }).promise();
            }

            throw error;
        })
        .catch(error => {
            if (error instanceof errors.VeendorError) {
                throw error;
            }

            throw new BundleUploadError(`${error.statusCode}: ${error.message}`);
        });
}

class BundleDownloadError extends errors.VeendorError {}
class BundleUploadError extends errors.VeendorError {}

module.exports = {
    validateOptions,
    pull,
    push,
    BundleDownloadError,
    BundleUploadError,
};
