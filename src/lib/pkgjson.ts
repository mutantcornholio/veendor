import crypto from 'crypto';
import * as errors from './errors';
import * as deepSortedJson from './deepSortedJson';

import {JSONObject} from '@/serviceTypes';
import {PkgJson, PackageHashOptions} from '@/types';

/**
 * package.json-related stuff
 */

/**
 * Calculates and returns hash of deps in package.json
 */
export function calcHash(
    pkgJson: PkgJson,
    lockfileContents: JSONObject | null = null,
    options: PackageHashOptions = {}
) {
    const resultSha1 = crypto.createHash('sha1');

    let sortedDeps = deepSortedJson.transform({
        dependencies: pkgJson.dependencies,
        devDependencies: pkgJson.devDependencies,
    });

    if (lockfileContents) {
        sortedDeps = sortedDeps.concat(deepSortedJson.transform(lockfileContents));
    }

    resultSha1.update(sortedDeps.join('\n'));

    const result = resultSha1.digest('hex');

    if (typeof options.suffix === 'string') {
        return result + '-' + options.suffix;
    }

    if (typeof options.suffix === 'function') {
        return result + '-' + options.suffix();
    }

    return result;
}

export function parsePkgJson(pkgJsonString: string): Promise<PkgJson> {
    return new Promise((resolve, reject) => {
        let pkgJson;

        try {
            pkgJson = JSON.parse(pkgJsonString);
        } catch (e) {
            return reject(e);
        }

        if (!(pkgJson.dependencies instanceof Object) && !(pkgJson.devDependencies instanceof Object)) {
            return reject(new EmptyPkgJsonError('No dependencies or devDependencies supplied'));
        }

        resolve(pkgJson);
    });
}

export class EmptyPkgJsonError extends errors.VeendorError {}
