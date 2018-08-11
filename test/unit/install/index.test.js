const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const fsExtra = require('fs-extra');
const path = require('path');
const _ = require('lodash');

const install = require('@/lib/install').default;
const installHelpers = require('@/lib/install/helpers');
const pkgJson = require('@/lib/pkgjson');
const gitWrapper = require('@/lib/commandWrappers/gitWrapper');
const npmWrapper = require('@/lib/commandWrappers/npmWrapper');
const rsyncWrapper = require('@/lib/commandWrappers/rsyncWrapper');
const errors = require('@/lib/errors');
const helpers = require('../helpers');

const assert = chai.assert;
chai.use(chaiAsPromised);

let PKGJSON;
let LOCKFILE;
let fakeSha1;
let sandbox;
let fakeBackends;
let config;
let npmWrapperInstallAllStub;
let rsyncWrapperAvailabilityStub;
let createCleanCacheDirStub;
let resultDir;

let fakeCreateCleanCacheDir = backend => {
    const res = `.veendor/${backend.alias}`;
    return fsExtra.ensureDir(res)
        .then(() => res);
};

const originalCwd = process.cwd();


describe('install', () => {
    beforeEach(() => {
        sandbox = sinon.sandbox.create();
        process.chdir(originalCwd);

        fakeBackends = [helpers.fakeBackendConfig('fakeBackends[0]'), helpers.fakeBackendConfig('fakeBackends[1]')];
        fakeBackends[0].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);

        npmWrapperInstallAllStub = sandbox.stub(npmWrapper, 'installAll').resolves();

        rsyncWrapperAvailabilityStub = sandbox.stub(rsyncWrapper, 'rsyncAvailable').resolves(false);

        resultDir = path.join(installHelpers.getTmpDir(), '__result');

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

    it('should reject with NodeModulesAlreadyExistError if node_modules already exist', done => {
        mockfs({
            'node_modules': {some: {stuff: 'inside'}},
            'package.json': JSON.stringify(PKGJSON)
        });

        const result = install({config});

        assert.isRejected(result, install.NodeModulesAlreadyExistError).notify(done);
    });

    it('should fail if pkgJson rejects with EmptyPkgJsonError', done => {
        sandbox.stub(pkgJson, 'parsePkgJson').rejects(new pkgJson.EmptyPkgJsonError);
        mockfs({
            'package.json': '{}'
        });

        const result = install({config});

        assert.isRejected(result, pkgJson.EmptyPkgJsonError).notify(done);
    });

    it('should delete node_modules, if force option is used', () => {
        mockfs({
            'node_modules': {some: {stuff: 'inside'}},
            'package.json': JSON.stringify(PKGJSON)
        });

        return install({force: true, config}).then(() => assert.throws(
            () => fsExtra.statSync(path.join(process.cwd(), 'node_modules', 'some')),
            'no such file or directory'
        ));
    });

    it('should fail if pkgJson is not supplied', () => {
        mockfs({});
        const result = install({config});

        return assert.isRejected(result, install.PkgJsonNotFoundError);
    });

    it('should call pkgjson with package.json contents first', () => {
        pkgJson.calcHash.restore();
        const pkgJsonMock = sandbox.mock(pkgJson).expects('calcHash').withArgs(PKGJSON);

        return install({config}).then(() => pkgJsonMock.verify());
    });

    it('should pass config.packageHash to pkgjson', () => {
        config.packageHash = {suffix: 'test'};
        pkgJson.calcHash.restore();
        const pkgJsonMock = sandbox.mock(pkgJson).expects('calcHash').withArgs(PKGJSON, null, config.packageHash);

        return install({config}).then(() => pkgJsonMock.verify());
    });

    it('should pass lockfile to pkgjson', () => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON),
            'package-lock.json': '{"watwatwat": "wat"}',
        });

        pkgJson.calcHash.restore();

        const pkgJsonMock = sandbox.mock(pkgJson)
            .expects('calcHash')
            .withArgs(PKGJSON, {watwatwat: 'wat'}).atLeast(1);

        return install({config, lockfilePath: 'package-lock.json'}).then(() => pkgJsonMock.verify());
    });

    it('should call `pull` on all backends until any backend succedes', () => {
        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend)
            .expects('pull')
            .withArgs(fakeSha1)
            .rejects(new errors.BundleNotFoundError);
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend)
            .expects('pull')
            .withArgs(fakeSha1)
            .callsFake(helpers.createNodeModules);

        return install({config: {backends: fakeBackends}}).then(() => {
            fakeBackends0Mock.verify();
            fakeBackends1Mock.verify();
        });
    });

    it('should create temp cwd for backends', done => {
        sandbox.stub(fakeBackends[0].backend, 'pull')
            .callsFake(() => {
                helpers.notifyAssert(() => assert(fsExtra.statSync(resultDir).isDirectory()), done);
                return helpers.createNodeModules();
            });

        install({config});
    });

    it('should clear result directory before calling', () => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON),
            [resultDir]: {
                'some': 'trash',
            },
        });

        sandbox.stub(fakeBackends[0].backend, 'pull')
            .callsFake(() => {
                assert.throws(
                    () => fsExtra.statSync(path.resolve(resultDir, 'some')),
                    'no such file or directory'
                );

                return helpers.createNodeModules();
            });

        return install({config});
    });

    it('should change cwd on backend `pull` call and change it back afterwards', () => {
        const originalCwd = process.cwd();
        sandbox.stub(fakeBackends[0].backend, 'pull')
            .callsFake(() => {
                assert.equal(process.cwd(), resultDir);
                return helpers.createNodeModules();
            });

        return install({config}).then(() => assert.equal(process.cwd(), originalCwd));
    });

    it('should stop calling `pull` if backend fails with generic error', done => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend)
            .expects('pull')
            .withArgs(fakeSha1)
            .rejects(new helpers.AnError('life sucks'));
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend)
            .expects('pull')
            .never();

        const checkResult = helpers.checkMockResult.bind(null, [fakeBackends0Mock, fakeBackends1Mock], done);

        install({
            config: {backends: fakeBackends}
        }).then(checkResult, checkResult);
    });

    it('should copy node_modules from local temp cwd to original place', () => {
        return install({config}).then(() => assert.equal(
            fsExtra.readFileSync(path.join(originalCwd, 'node_modules', 'foobar')),
            'deadbeef'
        ));
    });

    it('should rsync node_modules from local temp cwd to original place if rsync is available', () => {
        rsyncWrapperAvailabilityStub.restore();
        const rsyncWrapperMock = sandbox.mock(rsyncWrapper);

        rsyncWrapperMock
            .expects('rsyncAvailable')
            .resolves(true);

        rsyncWrapperMock
            .expects('syncDirs')
            .withArgs(path.join(resultDir, 'node_modules'), originalCwd)
            .resolves();


        return install({config}).then(() => {
            rsyncWrapperMock.verify();
        });
    });

    it('should not call rsyncWrapper.syncDirs if rsync is not available', () => {
        rsyncWrapperAvailabilityStub.restore();
        const rsyncWrapperMock = sandbox.mock(rsyncWrapper);

        rsyncWrapperMock
            .expects('rsyncAvailable')
            .resolves(false);

        rsyncWrapperMock
            .expects('syncDirs')
            .never();

        return install({config}).then(() => {
            rsyncWrapperMock.verify();
        });
    });

    it('should not call `push` if `pull` succedes', done => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend)
            .expects('push')
            .never();

        config.backends = [fakeBackends[1]];

        fakeBackends[1].push = true;
        const checkResult = helpers.checkMockResult.bind(null, [fakeBackends1Mock], done);

        install({config}).then(checkResult, checkResult);
    });

    it('should pass options to `pull` on a backend', done => {
        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend)
            .expects('pull')
            .withArgs(sinon.match.any, sinon.match.same(fakeBackends[0].options))
            .rejects(new errors.BundleNotFoundError);
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend)
            .expects('pull')
            .withArgs(sinon.match.any, sinon.match.same(fakeBackends[1].options))
            .callsFake(helpers.createNodeModules);

        const checkResult = helpers.checkMockResult.bind(null, [fakeBackends0Mock, fakeBackends1Mock], done);

        install({config}).then(checkResult, checkResult);
    });

    it('should call createCleanCacheDir before pull', () => {
        let calledBefore = false;
        createCleanCacheDirStub.restore();

        const createCleanCacheDirMock = sandbox.mock(installHelpers)
            .expects('createCleanCacheDir')
            .callsFake(fakeCreateCleanCacheDir);

        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend)
            .expects('pull')
            .callsFake(() => {
                createCleanCacheDirMock.verify();
                calledBefore = true;
                return helpers.createNodeModules();
            });

        return install({config}).then(() => {
            fakeBackends0Mock.verify();
            assert(calledBefore === true);
        });
    });

    it('should pass cache directory to pull', done => {
        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend)
            .expects('pull')
            .withArgs(sinon.match.any, sinon.match.any, sinon.match(`.veendor/${fakeBackends[0].alias}`))
            .rejects(new errors.BundleNotFoundError);
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend)
            .expects('pull')
            .withArgs(sinon.match.any, sinon.match.any, sinon.match(`.veendor/${fakeBackends[1].alias}`))
            .callsFake(helpers.createNodeModules);

        const checkResult = helpers.checkMockResult.bind(null, [fakeBackends0Mock, fakeBackends1Mock], done);

        install({config}).then(checkResult, checkResult);
    });

    it('should call `npmWrapper.installAll` if no backend succeded', done => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        npmWrapper.installAll.restore();
        const npmWrapperMock = sandbox.mock(npmWrapper, 'installAll')
            .expects('installAll');

        const checkResults = helpers.checkMockResult.bind(null, [npmWrapperMock], done);

        config.backends = [fakeBackends[0], fakeBackends[0]];

        install({config}).then(checkResults, checkResults);
    });

    it('should not call `npmWrapper.installAll` if fallbackToNpm set to false', done => {
        config.fallbackToNpm = false;
        config.backends = [fakeBackends[0], fakeBackends[0]];

        const result = install({config});

        assert.isRejected(result, install.BundlesNotFoundError).notify(done);
    });


    describe('_', () => {
        let fakePkgJson1;
        let fakePkgJson2;
        let pkgJsonStub;
        let gitWrapperOlderRevisionStub;
        let gitWrapperIsGitRepoStub;
        let npmWrapperInstallStub;
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

            pkgJson.calcHash.restore();
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
                .callsFake((gitDir, [filename1, filename2], age) => {
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

            gitWrapperIsGitRepoStub = sandbox.stub(gitWrapper, 'isGitRepo').callsFake(() => Promise.resolve(true));

            npmWrapperInstallStub = sandbox.stub(npmWrapper, 'install').callsFake(() => Promise.resolve());

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

        it('should look in useGitHistory.depth entries, starting at HEAD', (done) => {
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

            const result = install({config});

            const checkResult = helpers.checkMockResult.bind(null, [gitWrapperMock], done);

            result.then(checkResult, checkResult);
        });

        it('should call pkgjson with older package.json revision', done => {
            pkgJsonStub.restore();
            const pkgJsonMock = sandbox.mock(pkgJson);
            pkgJsonMock.expects('calcHash').withArgs(PKGJSON).returns('PKGJSONHash').atLeast(1);
            pkgJsonMock.expects('calcHash').withArgs(fakePkgJson2).returns('fakePkgJson2Hash').atLeast(1);
            pkgJsonMock.expects('calcHash').withArgs(fakePkgJson1).returns('fakePkgJson1Hash');

            const checkResult = helpers.checkMockResult.bind(null, [pkgJsonMock], done);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should pass options to pkgjson with older package.json revision', done => {
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
                .returns('PKGJSONHash')
                .atLeast(1);
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson2, null, config.packageHash)
                .returns('fakePkgJson2Hash')
                .atLeast(1);
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson1, null, config.packageHash)
                .returns('fakePkgJson1Hash');

            const checkResult = helpers.checkMockResult.bind(null, [pkgJsonMock], done);

            install({config}).then(checkResult, checkResult);
        });

        it('should pass options to pkgjson with older package.json revision', done => {
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
                .returns('PKGJSONHash')
                .atLeast(1);
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson1, null, config.packageHash)
                .returns('fakePkgJson1Hash');
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson2, null, config.packageHash)
                .returns('fakePkgJson2Hash')
                .atLeast(1);
            const checkResult = helpers.checkMockResult.bind(null, [pkgJsonMock], done);

            install({config}).then(checkResult, checkResult);
        });

        it('should pass lockfile to pkgjson with older package.json revision', done => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON),
                'package-lock.json': JSON.stringify(LOCKFILE),
            });
            pkgJsonStub.restore();
            const pkgJsonMock = sandbox.mock(pkgJson);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 3
            };

            pkgJsonMock
                .expects('calcHash')
                .withArgs(PKGJSON, LOCKFILE, config.packageHash)
                .returns('PKGJSONHash')
                .atLeast(1);
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson1, olderLockfiles[0], config.packageHash)
                .returns('fakePkgJson1Hash');
            pkgJsonMock
                .expects('calcHash')
                .withArgs(fakePkgJson2, olderLockfiles[1], config.packageHash)
                .returns('fakePkgJson2Hash')
                .atLeast(1);
            const checkResult = helpers.checkMockResult.bind(null, [pkgJsonMock], done);

            install({config, lockfilePath: 'package-lock.json'}).then(checkResult, checkResult);
        });

        it('should call `pull` on backends with gitWrapper.olderRevision\'s hash', done => {
            const backend0Mock = sandbox.mock(fakeBackends[0].backend);
            backend0Mock.expects('pull').withArgs('PKGJSONHash').rejects(new errors.BundleNotFoundError);
            backend0Mock.expects('pull').withArgs('fakePkgJson1Hash').callsFake(helpers.createNodeModules);

            const backend1Mock = sandbox.mock(fakeBackends[1].backend);
            backend1Mock.expects('pull').withArgs('PKGJSONHash').rejects(new errors.BundleNotFoundError);
            backend1Mock.expects('pull').withArgs('fakePkgJson1Hash').never();

            const checkResult = helpers.checkMockResult.bind(null, [backend0Mock, backend1Mock], done);

            config.backends = fakeBackends;
            config.useGitHistory = {
                depth: 1
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should reject if olderBundles not found', done => {
            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            config.fallbackToNpm = false;

            assert.isRejected(install({config}), install.BundlesNotFoundError).notify(done);
        });

        it('should not call gitWrapper.olderRevision if useGitHistory.depth is not defined', done => {
            gitWrapperOlderRevisionStub.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);

            gitWrapperMock.expects('olderRevision').never();

            const checkResult = helpers.checkMockResult.bind(null, [gitWrapperMock], done);

            config.backends = [fakeBackends[0]];

            install({config}).then(checkResult, checkResult);
        });

        it('should not call gitWrapper.olderRevision if not in git repo', done => {
            gitWrapperOlderRevisionStub.restore();
            gitWrapperIsGitRepoStub.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);

            gitWrapperMock.expects('isGitRepo').resolves(false);
            gitWrapperMock.expects('olderRevision').never();

            const checkResult = helpers.checkMockResult.bind(null, [gitWrapperMock], done);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should call `npmWrapper.install` with diff between package.json\'s ' +
            'after successful pull of history bundle', done => {

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

            const checkResult = helpers.checkMockResult.bind(null, [npmWrapperMock], done);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should call `npmWrapper.uninstall` for deleted modules', done => {
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

            const checkResult = helpers.checkMockResult.bind(null, [npmWrapperMock], done);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should not call `npmWrapper.uninstall` for modules moved from devdeps to deps', done => {
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

            const checkResult = helpers.checkMockResult.bind(null, [npmWrapperMock], done);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should call `push` on all backends with push: true option after partial npm install', done => {
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();

            const checkResult = helpers.checkMockResult.bind(null, [backendMock0, backendMock1], done);

            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should pass options to `push`', done => {
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            backendMock0
                .expects('push')
                .withArgs(sinon.match.any, sinon.match.same(fakeBackends[0].options))
                .resolves();

            const checkResult = helpers.checkMockResult.bind(null, [backendMock0], done);

            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should call createCleanCacheDir before push', () => {
            let calledBefore = false;
            let calls = 0;
            createCleanCacheDirStub.restore();

            const createCleanCacheDirMock = sandbox.mock(installHelpers)
                .expects('createCleanCacheDir')
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

        it('should pass cache directory to push', done => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });

            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            backendMock0
                .expects('push')
                .withArgs(sinon.match.any, sinon.match.any, sinon.match(fakeBackends[0].alias))
                .resolves();

            const checkResult = helpers.checkMockResult.bind(null, [backendMock0], done);

            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should call installAll if can not find old bundles', done => {
            config.useGitHistory = {
                depth: 2
            };

            npmWrapper.installAll.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper)
                .expects('installAll');

            const checkResults = helpers.checkMockResult.bind(null, [npmWrapperMock], done);

            config.backends = [fakeBackends[0], fakeBackends[0]];

            install({config}).then(checkResults, checkResults);
        });

        it('should call `push` on all backends with push: true option after npm install', done => {
            fakeBackends[1].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();

            const checkResult = helpers.checkMockResult.bind(null, [backendMock0, backendMock1], done);

            install({config}).then(checkResult, checkResult);
        });

        it('should call `push` on all backends with push: true option after npm install (with history)', done => {
            fakeBackends[1].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();

            const checkResult = helpers.checkMockResult.bind(null, [backendMock0, backendMock1], done);

            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should push bundle to backends, which don\'t have it, if got it from another backend', done => {
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();
            backendMock1.expects('pull').callsFake(helpers.createNodeModules);

            const checkResult = helpers.checkMockResult.bind(null, [backendMock0, backendMock1], done);

            install({config}).then(checkResult, checkResult);
        });

        it('should increase history.depth if hash hasn\'t changed ' +
            '(changes in package.json were unrelated to deps)', done => {

            gitWrapper.olderRevision.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);
            gitWrapperMock.expects('olderRevision').exactly(3).resolves([JSON.stringify(PKGJSON), null]);
            gitWrapperMock.expects('olderRevision').once().resolves([JSON.stringify(fakePkgJson2), null]);

            config.backends = [fakeBackends[1]];
            config.useGitHistory = {
                depth: 1
            };

            const checkResult = helpers.checkMockResult.bind(null, [gitWrapperMock], done);

            install({config}).then(checkResult, checkResult);
        });

        it('should not pull backends if hash hasn\'t changed ' +
            '(changes in package.json were unrelated to deps)', done => {
            pkgJson.calcHash.restore();
            let hashCount = 0;

            pkgJson.calcHash = () => {
                if (hashCount < 4) {
                    hashCount++;
                    return 'fakePkgJson1Hash';
                }

                return 'fakePkgJson2Hash';
            };

            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            backendMock0.expects('pull').withArgs('fakePkgJson1Hash').once().resolves();

            const checkResult = helpers.checkMockResult.bind(null, [backendMock0], done);

            install({config}).then(checkResult, checkResult);
        });

        it('failing to push with BundleAlreadyExistsError should call backend.pull once again', done => {
            let turn = 0;
            fakeBackends[0].backend.push = () => Promise.reject(new errors.BundleAlreadyExistsError());
            fakeBackends[0].backend.pull = () => {
                if (turn === 1) {
                    return helpers.createNodeModules();
                }
                turn++;

                return Promise.reject(new errors.BundleNotFoundError);
            };

            assert.isFulfilled(install({config})).notify(error => {
                if (error) {
                    return done(error);
                }

                try {
                    assert.equal(turn, 1);
                    done();
                } catch (e) {
                    done(e);
                }
            });
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

        it('re-pulling should be done with same bundle id, that original pull were', done => {
            // real life case: can't find bundles, run npm install, it changes package-lock,
            // another bundle is trying to be pulled, nothing's found, npm install, push, BundleAlreadyExistsError
            let turn = 0;
            fakeBackends[0].backend.push = () => {
                mockfs({
                    'package.json': JSON.stringify(fakePkgJson1)
                });

                return Promise.reject(new errors.BundleAlreadyExistsError())
            };

            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            backendMock0
                .expects('pull')
                .withArgs('PKGJSONHash').exactly(1).rejects(new errors.BundleNotFoundError)
                .withArgs('PKGJSONHash').exactly(1).resolves();

            const checkResult = helpers.checkMockResult.bind(null, [backendMock0], done);

            install({config}).then(checkResult, checkResult);
        });
    });
});
