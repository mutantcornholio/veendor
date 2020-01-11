import {afterEach, beforeEach, describe, it} from 'mocha';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import pushBackends from '@/lib/install/pushBackends';
import * as errors from '@/lib/errors';

import * as helpers from '../helpers';
import {BackendConfig} from '@/types';

const assert = chai.assert;
chai.use(chaiAsPromised);

describe('pushBackends', function () {
    let sandbox: sinon.SinonSandbox;
    let fakeBackends: BackendConfig[];
    const fakeSha1 = '1234567890deadbeef1234567890';

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        fakeBackends = [helpers.fakeBackendConfig('fakeBackends[0]'), helpers.fakeBackendConfig('fakeBackends[1]')];
        fakeBackends[0].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
        fakeBackends[0].push = true;
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

});
