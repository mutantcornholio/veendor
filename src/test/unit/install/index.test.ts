import {afterEach, beforeEach, describe, it} from 'mocha';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import mockfs from 'mock-fs';
import fsExtra from 'fs-extra';
import path from 'path';
import _ from 'lodash';

import install, {
    BundlesNotFoundError,
    InstallParams,
    NodeModulesAlreadyExistError,
    PkgJsonNotFoundError
} from '@/lib/install';
import * as installHelpers from '@/lib/install/helpers';
import * as pushBackends from '@/lib/install/pushBackends';
import * as pkgJson from '@/lib/pkgjson';
import * as gitWrapper from '@/lib/commandWrappers/gitWrapper';
import * as npmWrapper from '@/lib/commandWrappers/npmWrapper';
import * as rsyncWrapper from '@/lib/commandWrappers/rsyncWrapper';
import * as errors from '@/lib/errors';

import * as helpers from '../helpers';
import {BackendConfig, Config, PkgJson} from '@/types';

const assert = chai.assert;
chai.use(chaiAsPromised);

let PKGJSON: PkgJson;
let LOCKFILE: {};
let fakeSha1: string;
let sandbox: sinon.SinonSandbox;
let fakeBackends: BackendConfig[];
let config: Config;
let gitWrapperIsGitRepoStub: sinon.SinonStubbedMember<typeof gitWrapper.isGitRepo>;
let createCleanCacheDirStub: sinon.SinonStubbedMember<typeof installHelpers.createCleanCacheDir>;
let resultDir: string;

// const _pkgJson: typeof pkgJson | sinon.SinonStubbedInstance<typeof pkgJson> = pkgJson;

let fakeCreateCleanCacheDir = (backend: BackendConfig): Promise<string> => {
    const res = `.veendor/${backend.alias}`;
    return fsExtra.ensureDir(res)
        .then(() => res);
};

const originalCwd = process.cwd();


describe('install', () => {
    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        process.chdir(originalCwd);

        helpers.mockGetOutput(sandbox);

        fakeBackends = [helpers.fakeBackendConfig('fakeBackends[0]'), helpers.fakeBackendConfig('fakeBackends[1]')];
        fakeBackends[0].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);

        sandbox.stub(npmWrapper, 'installAll').resolves();
        sandbox.stub(rsyncWrapper, 'rsyncAvailable').resolves(false);
        sandbox.stub(rsyncWrapper, 'syncDirs').resolves();

        resultDir = path.join(installHelpers.getTmpDir(), '__result');
        gitWrapperIsGitRepoStub = sandbox.stub(gitWrapper, 'isGitRepo').callsFake(() => Promise.resolve(true));
        createCleanCacheDirStub = sandbox.stub(installHelpers, 'createCleanCacheDir')
            .callsFake(fakeCreateCleanCacheDir);

        PKGJSON = {
            dependencies: {
                foo: '2.2.8',
                c: '2.2.9'
            },
            devDependencies: {
                baz: '6.6.6'
            }
        };

        LOCKFILE = {
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

        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        config = {
            backends: fakeBackends,
            fallbackToNpm: true,
            installDiff: true,
            packageHash: {}
        };

        fakeSha1 = '1234567890deadbeef1234567890';
        sandbox.stub(pkgJson, 'calcHash').returns(fakeSha1);
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    it('should reject with NodeModulesAlreadyExistError if node_modules already exist', () => {
        mockfs({
            'node_modules': {some: {stuff: 'inside'}},
            'package.json': JSON.stringify(PKGJSON)
        });

        const result = install({config});

        return assert.isRejected(result, NodeModulesAlreadyExistError);
    });

    it('should fail if pkgJson rejects with EmptyPkgJsonError', () => {
        sandbox.stub(pkgJson, 'parsePkgJson').rejects(new pkgJson.EmptyPkgJsonError);
        mockfs({
            'package.json': '{}'
        });

        const result = install({config});

        return assert.isRejected(result, pkgJson.EmptyPkgJsonError);
    });

    it('should delete node_modules, if force option is used', () => {
        mockfs({
            'node_modules': {some: {stuff: 'inside'}},
            'package.json': JSON.stringify(PKGJSON)
        });

        return install({force: true, config}).then(() => assert.throws(
            () => fsExtra.statSync(path.join(process.cwd(), 'node_modules', 'some')),
            'ENOENT'
        ));
    });

    it('should fail if pkgJson is not supplied', () => {
        mockfs({});
        const result = install({config});

        return assert.isRejected(result, PkgJsonNotFoundError);
    });

    it('should call pkgjson with package.json contents first', () => {
        // @ts-ignore
        pkgJson.calcHash.restore();
        const pkgJsonMock = sandbox.mock(pkgJson).expects('calcHash').withArgs(PKGJSON);

        return install({config}).then(() => pkgJsonMock.verify());
    });

    it('should pass config.packageHash to pkgjson', () => {
        config.packageHash = {suffix: 'test'};
        // @ts-ignore
        pkgJson.calcHash.restore();
        const pkgJsonMock = sandbox.mock(pkgJson).expects('calcHash').withArgs(PKGJSON, null, config.packageHash);

        return install({config}).then(() => pkgJsonMock.verify());
    });

    it('should pass lockfile to pkgjson', () => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON),
            'package-lock.json': '{"watwatwat": "wat"}',
        });

        // @ts-ignore
        pkgJson.calcHash.restore();

        const pkgJsonMock = sandbox.mock(pkgJson)
            .expects('calcHash')
            .withArgs(PKGJSON, {watwatwat: 'wat'}).atLeast(1);

        return install({config, lockfilePath: 'package-lock.json'}).then(() => pkgJsonMock.verify());
    });

    it('should call `pull` on all backends until any backend succedes', () => {
        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend);
        fakeBackends0Mock
            .expects('pull')
            .withArgs(fakeSha1)
            .rejects(new errors.BundleNotFoundError);
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend);
        fakeBackends1Mock.expects('pull')
            .withArgs(fakeSha1)
            .callsFake(helpers.createNodeModules);

        const _config = Object.assign({}, config, {installDiff: false, backends: fakeBackends});

        return install({config: _config}).then(() => {
            fakeBackends0Mock.verify();
            fakeBackends1Mock.verify();
        });
    });

    it('should stop calling `pull` if backend fails with generic error', async () => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend);
        fakeBackends0Mock.expects('pull')
            .withArgs(fakeSha1)
            .rejects(new helpers.AnError('life sucks'));

        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend);
        fakeBackends1Mock.expects('pull')
            .never();

        const _config = Object.assign({}, config, {installDiff: false, backends: fakeBackends});

        await install({config: _config}).catch(() => {});
        fakeBackends0Mock.verify();
        fakeBackends1Mock.verify();
    });

    describe('rsync mode', () => {
        let installParams: InstallParams;
        beforeEach(() => {
            // @ts-ignore
            rsyncWrapper.rsyncAvailable.restore();
            sandbox.stub(rsyncWrapper, 'rsyncAvailable').resolves(true);

            installParams = {
                config,
                rsyncMode: true,
                force: true,
            };

            mockfs({
                'node_modules': {some: {stuff: 'inside'}},
                'package.json': JSON.stringify(PKGJSON)
            });
        });

        it('should not engage in rsync mode if rsync is not available', () => {
            // @ts-ignore
            rsyncWrapper.rsyncAvailable.restore();
            // @ts-ignore
            rsyncWrapper.syncDirs.restore();
            const rsyncWrapperMock = sandbox.mock(rsyncWrapper);

            rsyncWrapperMock
                .expects('rsyncAvailable')
                .resolves(false);

            rsyncWrapperMock
                .expects('syncDirs')
                .never();

            return install(installParams).then(() => {
                rsyncWrapperMock.verify();
            });
        });

        it('should not engage in rsync mode if there were no node_modules previously left', () => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON),
            });
            // @ts-ignore
            rsyncWrapper.syncDirs.restore();
            const rsyncWrapperMock = sandbox.mock(rsyncWrapper);

            rsyncWrapperMock
                .expects('syncDirs')
                .never();

            return install(installParams).then(() => {
                rsyncWrapperMock.verify();
            });
        });

        it('should not engage in rsync mode if rsync option is false', () => {
            // @ts-ignore
            rsyncWrapper.syncDirs.restore();
            const rsyncWrapperMock = sandbox.mock(rsyncWrapper);

            rsyncWrapperMock
                .expects('syncDirs')
                .never();

            installParams.rsyncMode = false;

            return install(installParams).then(() => {
                rsyncWrapperMock.verify();
            });
        });

        it('should create temp cwd for backends, when in rsync mode', done => {
            sandbox.stub(fakeBackends[0].backend, 'pull')
                .callsFake(() => {
                    helpers.notifyAssert(() => assert(fsExtra.statSync(resultDir).isDirectory()), done);
                    return helpers.createNodeModules();
                });

            install(installParams);
        });

        it('should not create temp cwd for backends, when not in rsync mode', done => {
            sandbox.stub(fakeBackends[0].backend, 'pull')
                .callsFake(() => {
                    helpers.notifyAssert(
                        () => assert.throws(
                            () => fsExtra.statSync(resultDir), 'ENOENT'
                        ), done);
                    return helpers.createNodeModules();
                });

            installParams.rsyncMode= false;
            install(installParams);
        });

        it('should clear result directory before calling, when in rsync mode', () => {
            mockfs({
                'node_modules': {some: {stuff: 'inside'}},
                'package.json': JSON.stringify(PKGJSON),
                [resultDir]: {
                    'some': 'trash',
                },
            });

            sandbox.stub(fakeBackends[0].backend, 'pull')
                .callsFake(() => {
                    assert.throws(
                        () => fsExtra.statSync(path.resolve(resultDir, 'some')),
                        'ENOENT'
                    );

                    return helpers.createNodeModules();
                });

            return install(installParams);
        });

        it('should change cwd on backend `pull` call and change it back afterwards, when in rsync mode', () => {
            const originalCwd = process.cwd();
            sandbox.stub(fakeBackends[0].backend, 'pull')
                .callsFake(() => {
                    assert.equal(process.cwd(), resultDir);
                    return helpers.createNodeModules();
                });

            return install(installParams).then(() => assert.equal(process.cwd(), originalCwd));
        });

        it('should not change cwd on when not in rsync mode', () => {
            const processMock = sandbox.mock(process)
                .expects('chdir')
                .never();

            installParams.rsyncMode = false;

            return install(installParams).then(processMock.verify());
        });

        it('should rsync node_modules from local temp cwd to origп ыеinal place if rsync is available', () => {
            // @ts-ignore
            rsyncWrapper.syncDirs.restore();
            const rsyncWrapperMock = sandbox.mock(rsyncWrapper);

            rsyncWrapperMock
                .expects('syncDirs')
                .withArgs(path.join(resultDir, 'node_modules'), originalCwd)
                .resolves();

            return install(installParams).then(() => {
                rsyncWrapperMock.verify();
            });
        });
    });

    it('should not call `push` if `pull` succedes', async () => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend)
            .expects('push')
            .never();

        config.backends = [fakeBackends[1]];

        fakeBackends[1].push = true;

        await install({config});
        fakeBackends1Mock.verify();
    });

    it('should pass options to `pull` on a backend', async () => {
        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend);
        fakeBackends0Mock.expects('pull')
            .withArgs(sinon.match.any, sinon.match.same(fakeBackends[0].options))
            .rejects(new errors.BundleNotFoundError);
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend);
        fakeBackends1Mock.expects('pull')
            .withArgs(sinon.match.any, sinon.match.same(fakeBackends[1].options))
            .callsFake(helpers.createNodeModules);

        await install({config});
        fakeBackends0Mock.verify();
        fakeBackends1Mock.verify();
    });

    it('should call createCleanCacheDir before pull', () => {
        let calledBefore = false;
        createCleanCacheDirStub.restore();

        const createCleanCacheDirMock = sandbox.mock(installHelpers);
        createCleanCacheDirMock.expects('createCleanCacheDir')
            .callsFake(fakeCreateCleanCacheDir);

        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend);
        fakeBackends0Mock.expects('pull')
            .callsFake(() => {
                createCleanCacheDirMock.verify();
                calledBefore = true;
                return helpers.createNodeModules();
            });

        return install({config}).then(() => {
            fakeBackends0Mock.verify();
            assert(calledBefore);
        });
    });

    it('should pass cache directory to pull', async () => {
        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend);
        fakeBackends0Mock.expects('pull')
            .withArgs(sinon.match.any, sinon.match.any, sinon.match(`.veendor/${fakeBackends[0].alias}`))
            .rejects(new errors.BundleNotFoundError);
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend);
        fakeBackends1Mock.expects('pull')
            .withArgs(sinon.match.any, sinon.match.any, sinon.match(`.veendor/${fakeBackends[1].alias}`))
            .callsFake(helpers.createNodeModules);

        await install({config});
        fakeBackends0Mock.verify();
        fakeBackends1Mock.verify();
    });

    it('should call `npmWrapper.installAll` if no backend succeded', async () => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        // @ts-ignore
        npmWrapper.installAll.restore();
        const npmWrapperMock = sandbox.mock(npmWrapper);
        npmWrapperMock.expects('installAll');

        config.backends = [fakeBackends[0], fakeBackends[0]];
        await install({config});

        npmWrapperMock.verify();
    });

    it('should not call `npmWrapper.installAll` if fallbackToNpm set to false', () => {
        config.fallbackToNpm = false;
        config.backends = [fakeBackends[0], fakeBackends[0]];

        const result = install({config});

        return assert.isRejected(result, BundlesNotFoundError);
    });


    describe('_', () => {
        let fakePkgJson1: PkgJson;
        let fakePkgJson2: PkgJson;
        let pkgJsonStub: sinon.SinonStubbedInstance<typeof pkgJson>;
        let gitWrapperOlderRevisionStub: sinon.SinonStubbedMember<typeof gitWrapper.olderRevision>;
        let npmWrapperInstallStub: sinon.SinonStubbedMember<typeof npmWrapper.install>;
        let olderLockfiles = [
            {content: 'package-lock.json a year ago'},
            {content: 'package-lock.json two years ago'},
            {content: 'package-lock.json three years ago'},
        ];

        beforeEach(() => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });
            fakePkgJson1 = _.cloneDeep(PKGJSON);
            fakePkgJson1.dependencies.c = '1.0.0';

            fakePkgJson2 = _.cloneDeep(PKGJSON);
            fakePkgJson2.dependencies.c = '2.1.8';

            // @ts-ignore
            pkgJson.calcHash.restore();
            // @ts-ignore
            pkgJsonStub = sandbox.stub(pkgJson, 'calcHash').callsFake((_pkgJson, lockfileContents) => {
                if (_.isEqual(_pkgJson, PKGJSON) && _.isEqual(lockfileContents, olderLockfiles[0])) {
                    return 'PKGJSONHash';
                } else if (_.isEqual(_pkgJson, PKGJSON) && _.isEqual(lockfileContents, LOCKFILE)) {
                    return 'PKGJSONHashWithNewLockfile';
                } else if (_.isEqual(_pkgJson, fakePkgJson1)) {
                    return 'fakePkgJson1Hash';
                } else if (_.isEqual(_pkgJson, fakePkgJson2)) {
                    return 'fakePkgJson2Hash';
                } else if (_.isEqual(_pkgJson, PKGJSON)) {
                    return 'PKGJSONHash';
                }

                throw new Error('Something is unmocked');
            });

            gitWrapperOlderRevisionStub = sandbox.stub(gitWrapper, 'olderRevision')
                .callsFake((_gitDir, [_filename1, filename2], age) => {
                    if (filename2 === 'package-lock.json') {
                        if (age === 1) {
                            return Promise.resolve([JSON.stringify(PKGJSON), JSON.stringify(LOCKFILE)]);
                        } else if (age === 2) {
                            return Promise.resolve([JSON.stringify(fakePkgJson1), JSON.stringify(olderLockfiles[0])]);
                        } else if (age === 3) {
                            return Promise.resolve([JSON.stringify(fakePkgJson2), JSON.stringify(olderLockfiles[1])]);
                        }
                    } else {
                        if (age === 1) {
                            return Promise.resolve([JSON.stringify(PKGJSON), null]);
                        } else if (age === 2) {
                            return Promise.resolve([JSON.stringify(fakePkgJson1), null]);
                        } else if (age === 3) {
                            return Promise.resolve([JSON.stringify(fakePkgJson2), null]);
                        }
                    }

                    return Promise.reject(new gitWrapper.TooOldRevisionError);
                });

            npmWrapperInstallStub = sandbox.stub(npmWrapper, 'install').callsFake(() => Promise.resolve(''));

            fakeBackends[0].push = true;
            fakeBackends[1].backend.pull = (hash) => {
                if (hash === 'PKGJSONHash' || hash === 'fakePkgJson1Hash') {
                    return Promise.reject(new errors.BundleNotFoundError);
                } else if (hash === 'fakePkgJson2Hash') {
                    return helpers.createNodeModules();
                } else {
                    throw new Error('Something is unmocked');
                }
            };
        });

        it('should look in useGitHistory.depth entries, starting at HEAD', async () => {
            gitWrapperOlderRevisionStub.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);

            gitWrapperMock.expects('olderRevision')
                .withArgs(process.cwd(), [sinon.match('package.json'), null], 1)
                .resolves([JSON.stringify(fakePkgJson1)]);

            gitWrapperMock.expects('olderRevision')
                .withArgs(process.cwd(), [sinon.match('package.json'), null], 2)
                .resolves([JSON.stringify(fakePkgJson1)]);

            gitWrapperMock.expects('olderRevision')
                .withArgs(process.cwd(), [sinon.match('package.json'), null], 3)
                .resolves([JSON.stringify(fakePkgJson2), null]);

            config.useGitHistory = {
                depth: 2
            };

            await install({config});
            gitWrapperMock.verify();
        });

        it('should call pkgjson with older package.json revision', async () => {
            // @ts-ignore
            pkgJsonStub.restore();
            const pkgJsonMock = sandbox.mock(pkgJson);
            pkgJsonMock.expects('calcHash').withArgs(PKGJSON).atLeast(1).returns('PKGJSONHash');
            pkgJsonMock.expects('calcHash').withArgs(fakePkgJson2).atLeast(1).returns('fakePkgJson2Hash');
            pkgJsonMock.expects('calcHash').withArgs(fakePkgJson1).returns('fakePkgJson1Hash');

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            await install({config});
            pkgJsonMock.verify();
        });

        it('should pass options to pkgjson with older package.json revision', async () => {
            // @ts-ignore
            pkgJsonStub.restore();
            const pkgJsonMock = sandbox.mock(pkgJson);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            config.packageHash = {suffix: 'test'};

            pkgJsonMock
                .expects('calcHash')
                .withArgs(PKGJSON, null, config.packageHash)
                .atLeast(1)
                .returns('PKGJSONHash');
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson2, null, config.packageHash)
                .atLeast(1)
                .returns('fakePkgJson2Hash');
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson1, null, config.packageHash)
                .returns('fakePkgJson1Hash');

            await install({config});
            pkgJsonMock.verify();
        });

        it('should pass options to pkgjson with older package.json revision', async () => {
            // @ts-ignore
            pkgJsonStub.restore();
            const pkgJsonMock = sandbox.mock(pkgJson);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            config.packageHash = {suffix: 'test'};

            pkgJsonMock
                .expects('calcHash')
                .withArgs(PKGJSON, null, config.packageHash)
                .atLeast(1)
                .returns('PKGJSONHash');
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson1, null, config.packageHash)
                .returns('fakePkgJson1Hash');
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson2, null, config.packageHash)
                .atLeast(1)
                .returns('fakePkgJson2Hash');

            await install({config});
            pkgJsonMock.verify();
        });

        it('should pass lockfile to pkgjson with older package.json revision', async () => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON),
                'package-lock.json': JSON.stringify(LOCKFILE),
            });
            // @ts-ignore
            pkgJsonStub.restore();
            const pkgJsonMock = sandbox.mock(pkgJson);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 3
            };

            pkgJsonMock
                .expects('calcHash')
                .withArgs(PKGJSON, LOCKFILE, config.packageHash)
                .atLeast(1)
                .returns('PKGJSONHash');
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson1, olderLockfiles[0], config.packageHash)
                .returns('fakePkgJson1Hash');
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson2, olderLockfiles[1], config.packageHash)
                .atLeast(1)
                .returns('fakePkgJson2Hash');

            await install({config, lockfilePath: 'package-lock.json'});
            pkgJsonMock.verify();
        });

        it('should call `pull` on backends with gitWrapper.olderRevision\'s hash', async () => {
            const backend0Mock = sandbox.mock(fakeBackends[0].backend);
            backend0Mock.expects('pull').withArgs('PKGJSONHash').rejects(new errors.BundleNotFoundError);
            backend0Mock.expects('pull').withArgs('fakePkgJson1Hash').callsFake(helpers.createNodeModules);

            const backend1Mock = sandbox.mock(fakeBackends[1].backend);
            backend1Mock.expects('pull').withArgs('PKGJSONHash').rejects(new errors.BundleNotFoundError);
            backend1Mock.expects('pull').withArgs('fakePkgJson1Hash').never();

            config.backends = fakeBackends;
            config.useGitHistory = {
                depth: 1
            };

            await install({config});
            backend0Mock.verify();
            backend1Mock.verify();
        });

        it('should reject if olderBundles not found', () => {
            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            config.fallbackToNpm = false;

            return assert.isRejected(install({config}), BundlesNotFoundError);
        });

        it('should not call gitWrapper.olderRevision if useGitHistory.depth is not defined', async () => {
            gitWrapperOlderRevisionStub.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);

            gitWrapperMock.expects('olderRevision').never();

            config.backends = [fakeBackends[0]];

            await install({config});
            gitWrapperMock.verify();
        });

        it('should not call gitWrapper.olderRevision if not in git repo', async () => {
            gitWrapperOlderRevisionStub.restore();
            gitWrapperIsGitRepoStub.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);

            gitWrapperMock.expects('isGitRepo').resolves(false);
            gitWrapperMock.expects('olderRevision').never();

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            await install({config});
            gitWrapperMock.verify();
        });

        it('should call `npmWrapper.install` with diff between package.json\'s ' +
            'after successful pull of history bundle', async () => {

            fakeBackends[0].backend.pull = (hash) => {
                if (hash === 'PKGJSONHash' || hash === 'fakePkgJson1Hash') {
                    return Promise.reject(new errors.BundleNotFoundError);
                } else if (hash === 'fakePkgJson2Hash') {
                    return helpers.createNodeModules();
                } else {
                    throw new Error('Something is unmocked');
                }
            };

            npmWrapperInstallStub.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper);
            npmWrapperMock.expects('install').withArgs({c: '2.2.9'}).resolves();

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 2
            };

            await install({config});
            npmWrapperMock.verify();
        });

        it('should call `npmWrapper.dedupe` after installing diff, if dedupe is enabled', async () => {
            fakeBackends[0].backend.pull = (hash) => {
                if (hash === 'PKGJSONHash' || hash === 'fakePkgJson1Hash') {
                    return Promise.reject(new errors.BundleNotFoundError);
                } else if (hash === 'fakePkgJson2Hash') {
                    return helpers.createNodeModules();
                } else {
                    throw new Error('Something is unmocked');
                }
            };

            config.dedupe = true;
            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 2
            };

            npmWrapperInstallStub.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper);
            npmWrapperMock.expects('install').resolves('');
            npmWrapperMock.expects('dedupe').resolves('');

            await install({config});
            npmWrapperMock.verify();
        });

        it('should call `npmWrapper.uninstall` for deleted modules', async () => {
            delete PKGJSON.dependencies.c;

            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });

            fakeBackends[0].backend.pull = (hash) => {
                if (hash === 'PKGJSONHash' || hash === 'fakePkgJson1Hash') {
                    return Promise.reject(new errors.BundleNotFoundError);
                } else if (hash === 'fakePkgJson2Hash') {
                    return helpers.createNodeModules();
                } else {
                    throw new Error('Something is unmocked');
                }
            };

            npmWrapperInstallStub.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper);
            npmWrapperMock.expects('uninstall').withArgs(['c']).resolves();

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 2
            };

            await install({config});
            npmWrapperMock.verify();
        });

        it('should not call `npmWrapper.uninstall` for modules moved from devdeps to deps', async () => {
            PKGJSON.devDependencies.c = fakePkgJson2.dependencies.c;
            delete PKGJSON.dependencies.c;

            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });

            fakeBackends[0].backend.pull = (hash) => {
                if (hash === 'PKGJSONHash' || hash === 'fakePkgJson1Hash') {
                    return Promise.reject(new errors.BundleNotFoundError);
                } else if (hash === 'fakePkgJson2Hash') {
                    return helpers.createNodeModules();
                } else {
                    throw new Error('Something is unmocked');
                }
            };

            npmWrapperInstallStub.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper);
            npmWrapperMock.expects('uninstall').never();
            npmWrapperMock.expects('install').never();

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 2
            };

            await install({config});
            npmWrapperMock.verify();
        });

        it('should call `push` on all backends with push: true option after partial npm install', async () => {
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();

            config.useGitHistory = {
                depth: 2
            };

            await install({config});
            backendMock0.verify();
            backendMock1.verify();
        });

        it('should pass options to `push`', async () => {
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            backendMock0
                .expects('push')
                .withArgs(sinon.match.any, sinon.match.same(fakeBackends[0].options))
                .resolves();

            config.useGitHistory = {
                depth: 2
            };

            await install({config});
            backendMock0.verify();
        });

        it('should call createCleanCacheDir before push', () => {
            let calledBefore = false;
            let calls = 0;
            createCleanCacheDirStub.restore();

            const createCleanCacheDirMock = sandbox.mock(installHelpers);
            createCleanCacheDirMock.expects('createCleanCacheDir')
                .withArgs(fakeBackends[0])
                .atLeast(1)
                .callsFake(backend => {
                    calls++;
                    return fakeCreateCleanCacheDir(backend);
                });

            const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend);

            fakeBackends0Mock
                .expects('pull')
                .callsFake(() => {
                    calls--;
                    return Promise.reject(new errors.BundleNotFoundError);
                });

            fakeBackends0Mock
                .expects('push')
                .callsFake(() => {
                    assert.equal(calls, 1);
                    calledBefore = true;
                    return Promise.resolve();
                });

            config.backends = [fakeBackends[0]];

            return install({config}).then(() => {
                fakeBackends0Mock.verify();
                assert(calledBefore === true);
            });
        });

        it('should pass cache directory to push', async () => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });

            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            backendMock0
                .expects('push')
                .withArgs(sinon.match.any, sinon.match.any, sinon.match(fakeBackends[0].alias))
                .resolves();

            config.useGitHistory = {
                depth: 2
            };

            await install({config});
            backendMock0.verify()
        });

        it('should call installAll if can not find old bundles', async () => {
            config.useGitHistory = {
                depth: 2
            };

            // @ts-ignore
            npmWrapper.installAll.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper)
                .expects('installAll');

            config.backends = [fakeBackends[0], fakeBackends[0]];

            await install({config});
            npmWrapperMock.verify();
        });

        it('should call `push` on all backends with push: true option after npm install', async () => {
            fakeBackends[1].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();

            await install({config});
            backendMock0.verify();
            backendMock1.verify();
        });

        it('should call `push` on all backends with push: true option after npm install (with history)', async () => {
            fakeBackends[1].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();

            config.useGitHistory = {
                depth: 2
            };

            await install({config});
            backendMock0.verify();
            backendMock1.verify();
        });

        it('should push bundle to backends, which don\'t have it, if got it from another backend', async () => {
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();
            backendMock1.expects('pull').callsFake(helpers.createNodeModules);

            await install({config});
            backendMock0.verify();
            backendMock1.verify();
        });

        it('should increase history.depth if hash hasn\'t changed ' +
            '(changes in package.json were unrelated to deps)', async () => {

            // @ts-ignore
            gitWrapper.olderRevision.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);
            gitWrapperMock.expects('olderRevision').exactly(3).resolves([JSON.stringify(PKGJSON), null]);
            gitWrapperMock.expects('olderRevision').once().resolves([JSON.stringify(fakePkgJson2), null]);

            config.backends = [fakeBackends[1]];
            config.useGitHistory = {
                depth: 1
            };

            await install({config});
            gitWrapperMock.verify();
        });

        it('should not pull backends if hash hasn\'t changed ' +
            '(changes in package.json were unrelated to deps)', async () => {
            // @ts-ignore
            pkgJson.calcHash.restore();
            let hashCount = 0;

            sandbox.stub(pkgJson, 'calcHash').callsFake(() => {
                if (hashCount < 4) {
                    hashCount++;
                    return 'fakePkgJson1Hash';
                }

                return 'fakePkgJson2Hash';
            });

            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            backendMock0.expects('pull').withArgs('fakePkgJson1Hash').once().resolves();

            await install({config});
            backendMock0.verify();
        });

        it('failing to push with BundleAlreadyExistsError should call backend.pull once again', async () => {
            let turn = 0;
            fakeBackends[0].backend.push = () => Promise.reject(new errors.BundleAlreadyExistsError());
            fakeBackends[0].backend.pull = () => {
                if (turn === 1) {
                    return helpers.createNodeModules();
                }
                turn++;

                return Promise.reject(new errors.BundleNotFoundError);
            };

            await assert.isFulfilled(install({config}));
            assert.equal(turn, 1);
        });

        it('failing to push with BundleAlreadyExistsError should call backend.pull only once', () => {
            let turn = 0;
            fakeBackends[0].backend.push = () => Promise.reject(new errors.BundleAlreadyExistsError());
            fakeBackends[0].backend.pull = () => {
                turn++;
                return Promise.reject(new errors.BundleNotFoundError);
            };

            return install({config})
                .catch(_.noop)
                .then(() => {
                    assert.equal(turn, 2);
                });
        });

        it('re-pulling should be done with same bundle id, that original pull were', async () => {
            // real life case: can't find bundles, run npm install, it changes package-lock,
            // another bundle is trying to be pulled, nothing's found, npm install, push, BundleAlreadyExistsError
            fakeBackends[0].backend.push = () => {
                mockfs({
                    'package.json': JSON.stringify(fakePkgJson1)
                });

                return Promise.reject(new errors.BundleAlreadyExistsError())
            };

            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            backendMock0.expects('pull').withArgs('PKGJSONHash').exactly(1).rejects(new errors.BundleNotFoundError);

            backendMock0.expects('pull').withArgs('PKGJSONHash').exactly(1).resolves();

            await install({config});
            backendMock0.verify();
        });

        it('should pass clearSharedCache to `pushBackends(1)`', async () => {
            config.clearSharedCache = false;
            const mock = sandbox.mock(pushBackends);
            mock.expects('pushBackends').withArgs(sinon.match.any, sinon.match.any, sinon.match.any, false);
            await install({config});
            mock.verify();
        });

        it('should pass clearSharedCache to `pushBackends(2)`', async () => {
            config.clearSharedCache = true;
            const mock = sandbox.mock(pushBackends);
            mock.expects('pushBackends').withArgs(sinon.match.any, sinon.match.any, sinon.match.any, true);
            await install({config});
            mock.verify();
        });
    });
});
