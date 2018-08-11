import fsExtra from 'fs-extra';
import {Config, ConfigWithHistory, PkgJson} from '@/types';
import {getLogger} from '@/lib/logger';
import * as gitWrapper from '@/lib/commandWrappers/gitWrapper';
import * as pkgJsonUtils from '@/lib/pkgjson';
import {BundlesNotFoundError} from '@/lib/install/index';
import * as helpers from '@/lib/install/helpers';

const {pkgJsonPath, originalCwd} = helpers.paths;

export async function getHistoryHash(
    config: ConfigWithHistory, lockfilePath: string | null = null, oldHash: string | null = null, historyIndexStart = 0
): Promise<{ hash: string, historyIndexEnd: number, pkgJson: PkgJson }> {
    const logger = getLogger();

    logger.trace(`Running getHistoryHash. pkgJsonPath: ${pkgJsonPath};` +
        ` lockfilePath: ${lockfilePath}, historyIndexStart: ${historyIndexStart}`);

    let currentHistoryIndex = historyIndexStart;

    while (true) {
        currentHistoryIndex++;

        const [pkgJsonString, lockfileString] = await gitWrapper.olderRevision(
            originalCwd, [pkgJsonPath, lockfilePath], currentHistoryIndex
        );

        const pkgJson = await pkgJsonUtils.parsePkgJson(pkgJsonString);
        const lockfileContents = typeof lockfileString === 'string' ? JSON.parse(lockfileString) : null;

        const hash = pkgJsonUtils.calcHash(pkgJson, lockfileContents, config.packageHash);

        if (hash === oldHash) {
            const message = `Hash at index '${historyIndexStart}' is still '${hash}'. Incrementing history depth`;
            logger.trace(message);
            config.useGitHistory.depth++;

            if (currentHistoryIndex > config.useGitHistory.depth) {
                throw new BundlesNotFoundError(
                    `Backends don't have bundles up to ${config.useGitHistory.depth} entries in git history of ${pkgJsonPath}`
                );
            }
        } else {
            return {hash, historyIndexEnd: currentHistoryIndex, pkgJson};
        }
    }
}

export async function getFSHash(
    config: Config, pkgJsonPath: string, lockfilePath: string | null
): Promise<{ hash: string, pkgJson: PkgJson }> {

    const logger = getLogger();
    const result = [];

    logger.trace(`Running getFSHash. pkgJsonPath: ${pkgJsonPath}; lockfilePath: ${lockfilePath}`);

    logger.trace('Reading package.json');
    result.push(fsExtra
        .readFile(pkgJsonPath)
        .then(pkgJsonBuf => {
            const pkgJsonString = pkgJsonBuf.toString();

            logger.trace('Parsing package.json');
            return pkgJsonUtils.parsePkgJson(pkgJsonString);
        }));

    if (lockfilePath !== null) {
        logger.trace(`Reading ${lockfilePath}`);
        result.push(fsExtra
            .readFile(lockfilePath)
            .then(lockfileBuf => {
                logger.trace(`Parsing ${lockfilePath}`);
                return JSON.parse(lockfileBuf.toString());
            }));
    } else {
        result.push(null);
    }

    const [pkgJson, lockfileContents] = await Promise.all(result);


    logger.debug(`Got dependencies:\t${JSON.stringify(pkgJson.dependencies)}`);
    logger.debug(`Got devDependencies:\t${JSON.stringify(pkgJson.devDependencies)}`);

    logger.trace('Calculating hash');
    const hash = pkgJsonUtils.calcHash(pkgJson, lockfileContents, config.packageHash);
    return {hash, pkgJson: pkgJson};
}

