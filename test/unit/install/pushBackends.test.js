const {describe, it, beforeEach, afterEach} = require('mocha');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const tracer = require('tracer');

const pushBackends = require('@/lib/install/pushBackends').default;
const errors = require('@/lib/errors');
const logger = require('@/lib/util/logger');
const helpers = require('../helpers');

const assert = chai.assert;
chai.use(chaiAsPromised);

describe('pushBackends', function () {
    let sandbox;
    let fakeBackends;
    const fakeSha1 = '1234567890deadbeef1234567890';
    let config;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();
        fakeBackends = [helpers.fakeBackendConfig('fakeBackends[0]'), helpers.fakeBackendConfig('fakeBackends[1]')];
        fakeBackends[0].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
        fakeBackends[0].push = true;

        config = {
            backends: fakeBackends,
            fallbackToNpm: true,
            installDiff: true,
            packageHash: {}
        };
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('failing to push on backends with pushMayFail === true should be ignored', done => {
        fakeBackends[0].backend.push = () => Promise.reject(new helpers.AnError());
        fakeBackends[0].pushMayFail = true;

        assert.isFulfilled(pushBackends(fakeBackends, fakeSha1)).notify(done);
    });

    it('failing to push on backends without pushMayFail === true should reject install', done => {
        fakeBackends[0].backend.push = () => Promise.reject(new helpers.AnError());

        assert.isRejected(pushBackends(fakeBackends, fakeSha1), helpers.AnError).notify(done);
    });

});
