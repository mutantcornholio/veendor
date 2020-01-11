import {afterEach, beforeEach, describe, it} from 'mocha';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import mockfs from 'mock-fs';
import fsExtra from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import * as helpers from '../helpers';
import {createCleanCacheDir} from '@/lib/install/helpers';
import {BackendConfig} from '@/types';

const assert = chai.assert;
chai.use(chaiAsPromised);

const FAKE_HASH = '1234567890deadbeef1234567890';

let sandbox: sinon.SinonSandbox;
let fakeBackend: BackendConfig;
let fakeSha1;

describe('createCleanCacheDir', () => {
    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        mockfs({});
        fakeBackend = helpers.fakeBackendConfig('fakeBackends[0]');

        fakeSha1 = {
            update: () => {},
            digest: () => FAKE_HASH,
        };

        // @ts-ignore
        sandbox.stub(crypto, 'createHash').returns(fakeSha1);
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    it('creates new cache dir', () => {
        return createCleanCacheDir(fakeBackend).then(dir => {
            assert(fsExtra.statSync(dir).isDirectory());
        });
    });

    it('cleans cache directory if one already exists', async () => {
        let dir = await createCleanCacheDir(fakeBackend);
        await fsExtra.writeFile(path.join(dir, 'foo'), 'bar');
        dir = await createCleanCacheDir(fakeBackend);

        return assert.throws(
            () => fsExtra.statSync((path.join(dir, 'foo'))),
            'ENOENT'
        );
    });

    it('doesn\'t clean cache directory if backend has keepCache == true option ', async () => {
        fakeBackend.backend.keepCache = true;


        let dir = await createCleanCacheDir(fakeBackend);
        await fsExtra.writeFile(path.join(dir, 'foo'), 'bar');
        dir = await createCleanCacheDir(fakeBackend);

        assert.equal(fsExtra.readFileSync(path.join(dir, 'foo')).toString(), 'bar');
    });

    it('creates cache directory in os.tmpdir() if can', () => {
        const tmpDir = os.tmpdir();

        return createCleanCacheDir(fakeBackend).then(dir => assert.match(dir, new RegExp(`^${tmpDir}`)));
    });

    it('contains hash of process.cwd() in tmpdir name', () => {
        return createCleanCacheDir(fakeBackend).then(dir => assert.include(dir, FAKE_HASH));
    });
});
