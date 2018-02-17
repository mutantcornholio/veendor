const {describe, it, beforeEach, afterEach} = require('mocha');

const pkgjson = require('../../lib/pkgjson');
const assert = require('chai').assert;
const moquire = require('mock-require');
const sinon = require('sinon');
const crypto = require('crypto');
const _ = require('lodash');

describe('pkgjson', function () {
    describe('#calcHash', function () {
        const PKGJSON_CONTENTS = {
            dependencies: {
                a: '666',
                b: '^228'
            },
            devDependencies: {
                c: '1.4.88',
                d: '^0.0.1'
            },
            otherField: {
                field: 'value'
            }
        };

        const LOCKFILE_CONTENTS = 'type-detect@^4.0.0:\n' +
            '  version "4.0.8"\n' +
            '  resolved "https://registry.yarnpkg.com/type-detect/-/type-detect-4.0.8.tgz' +
            '#7646fb5f18871cfbb7749e69bd39a6388eb7450c"';

        const FAKE_HASH = '1234567890deadbeef1234567890';

        let fakeSha1;

        beforeEach(function () {
            sinon.stub(crypto, 'createHash').callsFake(function () {
                fakeSha1 = {
                    update: sinon.spy(),
                    digest: function () {
                        return FAKE_HASH
                    }
                };

                return fakeSha1;
            });
        });

        afterEach(function () {
            crypto.createHash.restore();
        });

        it('should create SHA1 hash', function () {
            pkgjson.calcHash(PKGJSON_CONTENTS);
            assert(crypto.createHash.calledWith('sha1'), 'crypto.createHash(\'sha1\') hasn\'t been called');
        });

        it('should call SHA1 update from union of deps and dev-deps from pkgjson', function () {
            pkgjson.calcHash(PKGJSON_CONTENTS);

            const spyCall = fakeSha1.update.getCall(0);

            assert(fakeSha1.update.called, 'sha1.update hasn\'t been called');
            assert.include(spyCall.args[0], JSON.stringify([
                'a@666',
                'b@^228',
                'c@1.4.88',
                'd@^0.0.1'
            ]));
        });

        it('should sort deps before hashing', function () {
            PKGJSON_CONTENTS.devDependencies.a = PKGJSON_CONTENTS.dependencies.a;
            delete PKGJSON_CONTENTS.dependencies.a;
            pkgjson.calcHash(PKGJSON_CONTENTS);

            const spyCall = fakeSha1.update.getCall(0);

            assert(fakeSha1.update.called, 'sha1.update hasn\'t been called');
            assert.include(spyCall.args[0], JSON.stringify([
                'a@666',
                'b@^228',
                'c@1.4.88',
                'd@^0.0.1'
            ]));
        });

        it('should add lockfile contents to hash', function () {
            pkgjson.calcHash(PKGJSON_CONTENTS, LOCKFILE_CONTENTS);

            const spyCall = fakeSha1.update.getCall(1);

            assert(fakeSha1.update.called, 'sha1.update hasn\'t been called');
            assert.include(spyCall.args[0], LOCKFILE_CONTENTS);
        });

        it('should return result of SHA1 digest', function () {
            const result = pkgjson.calcHash(PKGJSON_CONTENTS);

            assert.equal(result, FAKE_HASH);
        });

        it('should add string suffixes', () => {
            const result = pkgjson.calcHash(PKGJSON_CONTENTS, null, {suffix: 'test'});

            assert.equal(result, FAKE_HASH + '-test');
        });

        it('should add function suffixes', () => {
            const result = pkgjson.calcHash(PKGJSON_CONTENTS, null, {suffix: () => 'test'});

            assert.equal(result, FAKE_HASH + '-test');
        });
    });
});
