import {afterEach, beforeEach, describe, it} from 'mocha';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import mockfs from 'mock-fs';
import fsExtra from 'fs-extra';

import {pushBackends} from '@/lib/install/pushBackends';
import * as errors from '@/lib/errors';

import * as helpers from '../helpers';
import {BackendConfig, PkgJson} from '@/types';

const assert = chai.assert;
chai.use(chaiAsPromised);

let PKGJSON: PkgJson;

describe('pushBackends', function () {
    let sandbox: sinon.SinonSandbox;
    let fakeBackends: BackendConfig[];
    const fakeSha1 = '1234567890deadbeef1234567890';

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        fakeBackends = [helpers.fakeBackendConfig('fakeBackends[0]'), helpers.fakeBackendConfig('fakeBackends[1]')];
        fakeBackends[0].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
        fakeBackends[0].push = true;

        PKGJSON = {
            dependencies: {
                foo: '2.2.8',
                c: '2.2.9'
            },
            devDependencies: {
                baz: '6.6.6'
            }
        };

    });

    afterEach(function () {
        sandbox.restore();
    });

    it('failing to push on backends with pushMayFail === true should be ignored', () => {
        fakeBackends[0].backend.push = () => Promise.reject(new helpers.AnError());
        fakeBackends[0].pushMayFail = true;

        return assert.isFulfilled(pushBackends(fakeBackends, fakeSha1));
    });

    it('failing to push on backends without pushMayFail === true should reject install', () => {
        fakeBackends[0].backend.push = () => Promise.reject(new helpers.AnError());

        return assert.isRejected(pushBackends(fakeBackends, fakeSha1), helpers.AnError);
    });

    it('should not clear node_modules/.cache, if `clearSharedCache` is set in config', async () => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON),
            'node_modules': {
                'left-pad': {
                    'package.json': '{"a": "b"}',
                },
                '.cache': {
                    'some': 'garbage',
                }
            }
        });

        fakeBackends[0].backend.push = () => fsExtra
            .stat('node_modules/.cache')
            .then(
                () => assert(true, 'cache is not cleared before push'),
                () => assert(false, 'cache is cleared before push'),
            );

        await pushBackends(fakeBackends, fakeSha1);
    });
    it('should not clear node_modules/.cache, if parameter is not passed', async () => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON),
            'node_modules': {
                'left-pad': {
                    'package.json': '{"a": "b"}',
                },
                '.cache': {
                    'some': 'garbage',
                }
            }
        });

        fakeBackends[0].backend.push = () => fsExtra
            .stat('node_modules/.cache')
            .then(
                () => assert(false, 'cache is not cleared before push'),
                () => assert(true, 'cache is cleared before push'),
            );

        await pushBackends(fakeBackends, fakeSha1, false, true);
    });
});
