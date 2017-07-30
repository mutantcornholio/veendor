const pkgjson = require('../../lib/pkgjson');
const assert = require('chai').assert;
const moquire = require('mock-require');
const sinon = require('sinon');
const crypto = require('crypto');
const _ = require('lodash');

describe('pkgjson', function () {
    describe('#calcHash', function () {
        const PKGJSON_PATH = 'package.json';
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

        const FAKE_HASH = '1234567890deadbeef1234567890';

        const fakeSha1 = {
            update: sinon.spy(),
            digest: function () {
                return FAKE_HASH
            }
        };

        before(function () {
            sinon.stub(crypto, 'createHash').callsFake(function () {
                return fakeSha1;
            });
        });

        after(function () {
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
            assert.deepEqual(spyCall.args[0], JSON.stringify(_.assign(
                {},
                PKGJSON_CONTENTS.dependencies,
                PKGJSON_CONTENTS.devDependencies
            )));
        });

        it('should return result of SHA1 digest', function () {
            const result = pkgjson.calcHash(PKGJSON_CONTENTS);

            assert.equal(result, FAKE_HASH);
        });

        xit('should add string suffixes');
        xit('should add function suffixes');
    });
});
