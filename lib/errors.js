'use strict';

class VeendorError extends Error {
    constructor(message) {
        super(message);
    }
}

class BundleAlreadyExistsError extends VeendorError {}
class BundleNotFoundError extends VeendorError {}
class InvalidOptionsError extends VeendorError {}
class RePullNeeded extends VeendorError {}

module.exports = {
    VeendorError,
    BundleAlreadyExistsError,
    BundleNotFoundError,
    InvalidOptionsError,
    RePullNeeded,
};
