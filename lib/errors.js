'use strict';

class BundleAlreadyExistsError extends Error {}
class BundleNotFoundError extends Error {}
class InvalidOptionsError extends Error {}

module.exports = {
    BundleAlreadyExistsError,
    BundleNotFoundError,
    InvalidOptionsError
};
