import {afterEach, beforeEach, describe, it} from 'mocha';

import chai from 'chai';
import sinon from 'sinon';
import crypto from 'crypto';

import {calcHash} from '@/lib/pkgjson';
import * as deepSortedJson from '@/lib/deepSortedJson';

const {assert} = chai;

describe('pkgjson', () => {
    describe('#calcHash', () => {
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

        const LOCKFILE_CONTENTS = {
            name: 'wat',
            dependencies: {
                a: {version: '666'},
                b: {version: '^228'},
                c: {version: '1.4.88'},
                d: {version: '^0.0.1'},
            },
            otherField: {
                field: 'value',
            }
        };

        const FAKE_HASH = '1234567890deadbeef1234567890';

        let fakeSha1: {
            update(): void,
            digest(): string,
        };
        let sandbox: sinon.SinonSandbox;

        beforeEach(function () {
            sandbox = sinon.sandbox.create();

            fakeSha1 = {
                update: () => {},
                digest: () => FAKE_HASH
            };

            // @ts-ignore
            sandbox.stub(crypto, 'createHash').callsFake(() => fakeSha1);

            sandbox.stub(deepSortedJson, 'transform')
                .callsFake(data => {
                    if (data === LOCKFILE_CONTENTS) {
                        return ['lockfile.b.c=d']
                    }

                    return ['a.b.c=d']
                });
        });

        afterEach(() => {
            sandbox.restore();
        });

        it('should create SHA1 hash', () => {
            calcHash(PKGJSON_CONTENTS);
            // @ts-ignore ts-sinon does a very bad job here
            assert(crypto.createHash.calledWith('sha1'), 'crypto.createHash(\'sha1\') hasn\'t been called');
        });

        it('should call deepSortedJson with deps and dev-deps from pkgjson', () => {
            // @ts-ignore
            deepSortedJson.transform.restore();
            const mock = sandbox.mock(deepSortedJson);
                mock.expects('transform')
                .withArgs({
                    dependencies: PKGJSON_CONTENTS.dependencies,
                    devDependencies: PKGJSON_CONTENTS.devDependencies,
                })
                .returns(['a.b.c=d']);

            calcHash(PKGJSON_CONTENTS);

            mock.verify();
        });

        it('should call deepSortedJson with lockfile contents', () => {
            // @ts-ignore
            deepSortedJson.transform.restore();
            const mock = sandbox.mock(deepSortedJson);

            mock.expects('transform')
                .withArgs({
                    dependencies: PKGJSON_CONTENTS.dependencies,
                    devDependencies: PKGJSON_CONTENTS.devDependencies,
                })
                .returns(['a.b.c=d']);

            mock.expects('transform')
                .withArgs(LOCKFILE_CONTENTS)
                .returns(['lockfile.b.c=d']);

            calcHash(PKGJSON_CONTENTS, LOCKFILE_CONTENTS);

            mock.verify();
        });

        it('call call SHA1 update with results of deepSortedJson', () => {
            const mock = sandbox.mock(fakeSha1)
                .expects('update')
                .withArgs(
                    'a.b.c=d\n' +
                    'lockfile.b.c=d'
                );

            calcHash(PKGJSON_CONTENTS, LOCKFILE_CONTENTS);

            mock.verify();
        });

        it('should return result of SHA1 digest', function () {
            const result = calcHash(PKGJSON_CONTENTS);

            assert.equal(result, FAKE_HASH);
        });

        it('should add string suffixes', () => {
            const result = calcHash(PKGJSON_CONTENTS, null, {suffix: 'test'});

            assert.equal(result, FAKE_HASH + '-test');
        });

        it('should add function suffixes', () => {
            const result = calcHash(PKGJSON_CONTENTS, null, {suffix: () => 'test'});

            assert.equal(result, FAKE_HASH + '-test');
        });
    });
});
