export class VeendorError extends Error {
    constructor(message: string = ' ') {
        super(message);
    }
}

export class BundleAlreadyExistsError extends VeendorError {}
export class BundleNotFoundError extends VeendorError {}
export class InvalidOptionsError extends VeendorError {}
export class RePullNeeded extends VeendorError {}
