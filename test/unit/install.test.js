const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const fsExtra = require('fs-extra');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const tracer = require('tracer');

const install = require('../../lib/install');
const pkgJson = require('../../lib/pkgjson');
const gitWrapper = require('../../lib/commandWrappers/gitWrapper');
const npmWrapper = require('../../lib/commandWrappers/npmWrapper');
const errors = require('../../lib/errors');
const logger = require('../../lib/logger');
const helpers = require('./helpers');

const assert = chai.assert;
chai.use(chaiAsPromised);

let PKGJSON;
let fakeSha1;
let sandbox;
let fakeBackends;
let config;


describe('install', () => {
    beforeEach(() => {
        sandbox = sinon.sandbox.create();

        fakeBackends = [helpers.fakeBackendConfig('fakeBackends[0]'), helpers.fakeBackendConfig('fakeBackends[1]')];
        fakeBackends[0].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);

        sandbox.stub(npmWrapper, 'installAll').resolves();

        PKGJSON = {
            dependencies: {
                foo: '2.2.8',
                c: '2.2.9'
            },
            devDependencies: {
                baz: '6.6.6'
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

        logger.setLogger(tracer.console({level: 6}));
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    it('should fail if node_modules already exist', done => {
        mockfs({
            'node_modules': {some: {stuff: 'inside'}},
            'package.json': JSON.stringify(PKGJSON)
        });

        const result = install({config: {}});

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

    it('should delete node_modules, if force option is used', done => {
        mockfs({
            'node_modules': {some: {stuff: 'inside'}},
            'package.json': JSON.stringify(PKGJSON)
        });

        const nodeModules = path.join(process.cwd(), 'node_modules');

        install({force: true, config}).then(() => {
            fsExtra.stat(nodeModules).then(() => {
                done(new Error('node_modules haven\'t been removed'));
            }, () => {
                done();
            });
        }, done);
    });

    it('should fail if pkgJson is not supplied', done => {
        mockfs({});
        const result = install({config});

        assert.isRejected(result, install.PkgJsonNotFoundError).notify(done);
    });

    it('should call pkgjson with package.json contents first', done => {
        pkgJson.calcHash.restore();
        const pkgJsonMock = sandbox.mock(pkgJson).expects('calcHash').withArgs(PKGJSON);
        const checkResult = checkMockResult.bind(null, [pkgJsonMock], done);

        install({config}).then(checkResult, checkResult);
    });

    it('should pass config.packageHash to pkgjson', done => {
        config.packageHash = {suffix: 'test'};
        pkgJson.calcHash.restore();
        const pkgJsonMock = sandbox.mock(pkgJson).expects('calcHash').withArgs(PKGJSON, config.packageHash);
        const checkResult = checkMockResult.bind(null, [pkgJsonMock], done);

        install({config}).then(checkResult, checkResult);
    });

    it('should call `pull` on all backends until any backend succedes', done => {
        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend)
            .expects('pull')
            .withArgs(fakeSha1)
            .rejects(new errors.BundleNotFoundError);
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend)
            .expects('pull')
            .withArgs(fakeSha1)
            .resolves();

        const checkResult = checkMockResult.bind(null, [fakeBackends0Mock, fakeBackends1Mock], done);

        install({
            config: {backends: fakeBackends}
        }).then(checkResult, checkResult);
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

        const checkResult = checkMockResult.bind(null, [fakeBackends0Mock, fakeBackends1Mock], done);

        install({
            config: {backends: fakeBackends}
        }).then(checkResult, checkResult);
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
        const checkResult = checkMockResult.bind(null, [fakeBackends1Mock], done);

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
            .resolves();

        const checkResult = checkMockResult.bind(null, [fakeBackends0Mock, fakeBackends1Mock], done);

        install({config}).then(checkResult, checkResult);
    });

    it('should create cache directory before pull', done => {
        const checkResult = () => {
            fsExtra.stat(path.resolve('.veendor', fakeBackends[0].alias)).then(() => done(), done);
        };

        install({config}).then(checkResult, checkResult);
    });

    it('should pass cache directory to pull', done => {
        const fakeBackends0Mock = sandbox.mock(fakeBackends[0].backend)
            .expects('pull')
            .withArgs(sinon.match.any, sinon.match.any, sinon.match(`.veendor/${fakeBackends[0].alias}`))
            .rejects(new errors.BundleNotFoundError);
        const fakeBackends1Mock = sandbox.mock(fakeBackends[1].backend)
            .expects('pull')
            .withArgs(sinon.match.any, sinon.match.any, sinon.match(`.veendor/${fakeBackends[1].alias}`))
            .resolves();

        const checkResult = checkMockResult.bind(null, [fakeBackends0Mock, fakeBackends1Mock], done);

        install({config}).then(checkResult, checkResult);
    });

    it('should clean cache directory before pull', done => {
        const mockfsConfig = {
            '.veendor': {},
            'package.json': JSON.stringify(PKGJSON)
        };

        mockfsConfig['.veendor'][fakeBackends[0].alias] = {'shouldBeDeleted': 'true'};
        mockfs(mockfsConfig);

        fakeBackends[0].backend.pull = () => {
            return new Promise((resolve, reject) => {
                fsExtra.stat(path.resolve('.veendor', fakeBackends[0].alias, 'shouldBeDeleted')).then(
                    () => {done(new Error(`'.veendor/${fakeBackends[0].alias}/shouldBeDeleted' is not deleted`))},
                    (err) => {
                        if (err.code === 'ENOENT') {
                            done();
                        } else {
                            done(err);
                        }

                    }
                );

                return reject(new errors.BundleNotFoundError);
            });
        };

        install({config});
    });

    it('should not clean cache directory before pull if backend has keepCache === true property', done => {
        const mockfsConfig = {
            '.veendor': {},
            'package.json': JSON.stringify(PKGJSON)
        };

        mockfsConfig['.veendor'][fakeBackends[0].alias] = {'shouldStay': 'true'};
        mockfs(mockfsConfig);

        fakeBackends[0].backend.keepCache = true;

        fakeBackends[0].backend.pull = () => {
            return new Promise((resolve, reject) => {
                fsExtra.stat(path.resolve('.veendor', fakeBackends[0].alias, 'shouldStay')).then(
                    () => {done()},
                    done
                );

                return reject(new errors.BundleNotFoundError);
            });
        };

        install({config});
    });

    it('should call `npmWrapper.installAll` if no backend succeded', done => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        npmWrapper.installAll.restore();
        const npmWrapperMock = sandbox.mock(npmWrapper, 'installAll')
            .expects('installAll');

        const checkResults = checkMockResult.bind(null, [npmWrapperMock], done);

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
        let npmWrapperStub;

        beforeEach(() => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });
            fakePkgJson1 = _.cloneDeep(PKGJSON);
            fakePkgJson1.dependencies.c = '1.0.0';

            fakePkgJson2 = _.cloneDeep(PKGJSON);
            fakePkgJson2.dependencies.c = '2.1.8';

            pkgJson.calcHash.restore();
            pkgJsonStub = sandbox.stub(pkgJson, 'calcHash').callsFake(_pkgJson => {
                if (_.isEqual(_pkgJson, fakePkgJson1)) {
                    return 'fakePkgJson1Hash';
                } else if (_.isEqual(_pkgJson, fakePkgJson2)) {
                    return 'fakePkgJson2Hash';
                } else if (_.isEqual(_pkgJson, PKGJSON)) {
                    return 'PKGJSONHash';
                }

                throw new Error('Something is unmocked');
            });

            gitWrapperOlderRevisionStub = sandbox.stub(gitWrapper, 'olderRevision')
                .callsFake((gitDir, filename, age) => {
                    if (age === 1) {
                        return Promise.resolve(JSON.stringify(PKGJSON));
                    }else if (age === 2) {
                        return Promise.resolve(JSON.stringify(fakePkgJson1));
                    } else if (age === 3) {
                        return Promise.resolve(JSON.stringify(fakePkgJson2));
                    }

                    return Promise.reject(new gitWrapper.TooOldRevisionError);
                });

            gitWrapperIsGitRepoStub = sandbox.stub(gitWrapper, 'isGitRepo').callsFake(() => Promise.resolve());

            npmWrapperStub = sandbox.stub(npmWrapper, 'install').callsFake(() => Promise.resolve());

            fakeBackends[0].push = true;
            fakeBackends[1].backend.pull = (hash) => {
                if (hash === 'PKGJSONHash' || hash === 'fakePkgJson1Hash') {
                    return Promise.reject(new errors.BundleNotFoundError);
                } else if (hash === 'fakePkgJson2Hash') {
                    return Promise.resolve();
                } else {
                    throw new Error('Something is unmocked');
                }
            };
        });

        it('should look in useGitHistory.depth entries, starting at HEAD', (done) => {
            gitWrapperOlderRevisionStub.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);

            gitWrapperMock.expects('olderRevision')
                .withArgs(process.cwd(), sinon.match('package.json'), 1)
                .resolves(JSON.stringify(fakePkgJson1));

            gitWrapperMock.expects('olderRevision')
                .withArgs(process.cwd(), sinon.match('package.json'), 2)
                .resolves(JSON.stringify(fakePkgJson1));

            gitWrapperMock.expects('olderRevision')
                .withArgs(process.cwd(), sinon.match('package.json'), 3)
                .resolves(JSON.stringify(fakePkgJson2));

            config.useGitHistory = {
                depth: 2
            };

            const result = install({config});

            const checkResult = checkMockResult.bind(null, [gitWrapperMock], done);

            result.then(checkResult, checkResult);
        });

        it('should call pkgjson with older package.json revision', done => {
            pkgJsonStub.restore();
            const pkgJsonMock = sandbox.mock(pkgJson);

            pkgJsonMock.expects('calcHash').withArgs(PKGJSON).returns('PKGJSONHash').atLeast(1);
            pkgJsonMock.expects('calcHash').withArgs(fakePkgJson2).returns('fakePkgJson2Hash').atLeast(1);
            pkgJsonMock.expects('calcHash').withArgs(fakePkgJson1).returns('fakePkgJson1Hash');

            const checkResult = checkMockResult.bind(null, [pkgJsonMock], done);

            config.backends = [fakeBackends[0]];
            config.useGitHistory = {
                depth: 1
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should call `pull` on backends with gitWrapper.olderRevision\'s hash', done => {
            const backend0Mock = sandbox.mock(fakeBackends[0].backend);
            backend0Mock.expects('pull').withArgs('PKGJSONHash').rejects(new errors.BundleNotFoundError);
            backend0Mock.expects('pull').withArgs('fakePkgJson1Hash').resolves();

            const backend1Mock = sandbox.mock(fakeBackends[1].backend);
            backend1Mock.expects('pull').withArgs('PKGJSONHash').rejects(new errors.BundleNotFoundError);
            backend1Mock.expects('pull').withArgs('fakePkgJson1Hash').never();

            const checkResult = checkMockResult.bind(null, [backend0Mock, backend1Mock], done);

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

            const checkResult = checkMockResult.bind(null, [gitWrapperMock], done);

            config.backends = [fakeBackends[0]];

            install({config}).then(checkResult, checkResult);
        });

        it('should not call gitWrapper.olderRevision if not in git repo', done => {
            gitWrapperOlderRevisionStub.restore();
            gitWrapperIsGitRepoStub.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);

            gitWrapperMock.expects('isGitRepo').rejects(new gitWrapper.NotAGitRepoError);
            gitWrapperMock.expects('olderRevision').never();

            const checkResult = checkMockResult.bind(null, [gitWrapperMock], done);

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
                    return Promise.resolve();
                } else {
                    throw new Error('Something is unmocked');
                }
            };

            npmWrapperStub.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper);
            npmWrapperMock.expects('install').withArgs({c: '2.2.9'}).resolves();

            const checkResult = checkMockResult.bind(null, [npmWrapperMock], done);

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
                    return Promise.resolve();
                } else {
                    throw new Error('Something is unmocked');
                }
            };

            npmWrapperStub.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper);
            npmWrapperMock.expects('uninstall').withArgs(['c']).resolves();

            const checkResult = checkMockResult.bind(null, [npmWrapperMock], done);

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
                    return Promise.resolve();
                } else {
                    throw new Error('Something is unmocked');
                }
            };

            npmWrapperStub.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper);
            npmWrapperMock.expects('uninstall').never();
            npmWrapperMock.expects('install').never();

            const checkResult = checkMockResult.bind(null, [npmWrapperMock], done);

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

            const checkResult = checkMockResult.bind(null, [backendMock0, backendMock1], done);

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

            const checkResult = checkMockResult.bind(null, [backendMock0], done);

            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should create cache directory before push', done => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });

            const checkResult = () => {
                fsExtra.stat(path.resolve('.veendor', fakeBackends[0].alias)).then(() => done(), done);
            };

            const old1Pull = fakeBackends[1].backend.pull;
            fakeBackends[1].backend.pull = (hash) => {
                mockfs.restore();
                mockfs({
                    'package.json': JSON.stringify(PKGJSON)
                });

                return old1Pull(hash);
            };

            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should pass cache directory to push', done => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });

            const backendMock0 = sandbox.mock(fakeBackends[0].backend);

            backendMock0
                .expects('push')
                .withArgs(sinon.match.any, sinon.match.any, path.resolve('.veendor', fakeBackends[0].alias))
                .resolves();

            const checkResult = checkMockResult.bind(null, [backendMock0], done);

            config.useGitHistory = {
                depth: 2
            };

            install({config}).then(checkResult, checkResult);
        });

        it('should clean cache directory before push', done => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });

            fakeBackends[0].backend.pull = () => {
                const mockfsConfig = {
                    '.veendor': {},
                    'package.json': JSON.stringify(PKGJSON)
                };

                mockfsConfig['.veendor'][fakeBackends[0].alias] = {'shouldBe': 'deleted'};
                mockfs(mockfsConfig);

                return Promise.reject(new errors.BundleNotFoundError);
            };

            fakeBackends[0].backend.push = () => {
                return new Promise(resolve => {
                    fsExtra.stat(path.resolve('.veendor', fakeBackends[0].alias, 'shouldBe')).then(
                        () => {done(new Error(`'.veendor/${fakeBackends[0].alias}/shouldBe' should be deleted`))},
                        (err) => {
                            if (err.code === 'ENOENT') {
                                done();
                            } else {
                                done(err);
                            }
                        }
                    );

                    return resolve();
                });
            };

            config.useGitHistory = {
                depth: 2
            };

            install({config});
        });

        it('should not clean cache directory before push if backend has keepCache === true property', done => {
            mockfs({
                'package.json': JSON.stringify(PKGJSON)
            });

            fakeBackends[0].backend.keepCache = true;
            fakeBackends[0].backend.pull = () => {
                const mockfsConfig = {
                    '.veendor': {},
                    'package.json': JSON.stringify(PKGJSON)
                };

                mockfsConfig['.veendor'][fakeBackends[0].alias] = {'shouldStay': 'true'};
                mockfs(mockfsConfig);

                return Promise.reject(new errors.BundleNotFoundError);
            };

            fakeBackends[0].backend.push = () => {
                return new Promise(resolve => {
                    fsExtra.stat(path.resolve('.veendor', fakeBackends[0].alias, 'shouldStay')).then(
                        () => {done()},
                        done
                    );

                    return resolve();
                });
            };

            config.useGitHistory = {
                depth: 2
            };

            install({config});
        });

        it('should call installAll if can not find old bundles', done => {
            config.useGitHistory = {
                depth: 2
            };

            npmWrapper.installAll.restore();
            const npmWrapperMock = sandbox.mock(npmWrapper)
                .expects('installAll');

            const checkResults = checkMockResult.bind(null, [npmWrapperMock], done);

            config.backends = [fakeBackends[0], fakeBackends[0]];

            install({config}).then(checkResults, checkResults);
        });

        it('should call `push` on all backends with push: true option after npm install', done => {
            fakeBackends[1].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();

            const checkResult = checkMockResult.bind(null, [backendMock0, backendMock1], done);

            install({config}).then(checkResult, checkResult);
        });

        it('should call `push` on all backends with push: true option after npm install (with history)', done => {
            fakeBackends[1].backend.pull = () => Promise.reject(new errors.BundleNotFoundError);
            const backendMock0 = sandbox.mock(fakeBackends[0].backend);
            const backendMock1 = sandbox.mock(fakeBackends[1].backend);

            backendMock0.expects('push').withArgs('PKGJSONHash').resolves();
            backendMock1.expects('push').never();

            const checkResult = checkMockResult.bind(null, [backendMock0, backendMock1], done);

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
            backendMock1.expects('pull').resolves();

            const checkResult = checkMockResult.bind(null, [backendMock0, backendMock1], done);

            install({config}).then(checkResult, checkResult);
        });

        it('should increase history.depth if hash hasn\'t changed ' +
            '(changes in package.json were unrelated to deps)', done => {

            gitWrapper.olderRevision.restore();
            const gitWrapperMock = sandbox.mock(gitWrapper);
            gitWrapperMock.expects('olderRevision').exactly(3).resolves(JSON.stringify(PKGJSON));
            gitWrapperMock.expects('olderRevision').once().resolves(JSON.stringify(fakePkgJson2));

            config.backends = [fakeBackends[1]];
            config.useGitHistory = {
                depth: 1
            };

            const checkResult = checkMockResult.bind(null, [gitWrapperMock], done);

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

            const checkResult = checkMockResult.bind(null, [backendMock0], done);

            install({config}).then(checkResult, checkResult);
        });

        it('failing to push on backends without pushMayFail === true should reject install', done => {
            fakeBackends[0].backend.push = () => Promise.reject(new helpers.AnError());

            assert.isRejected(install({config}), helpers.AnError).notify(done);
        });

        it('failing to push on backends with pushMayFail === true should be ignored', done => {
            fakeBackends[0].backend.push = () => Promise.reject(new helpers.AnError());
            fakeBackends[0].pushMayFail = true;

            assert.isFulfilled(install({config})).notify(done);
        });

        it('failing to push with BundleAlreadyExistsError should call backend.pull once again', done => {
            let turn = 0;
            fakeBackends[0].backend.push = () => Promise.reject(new errors.BundleAlreadyExistsError());
            fakeBackends[0].backend.pull = () => {
                if (turn === 1) {
                    return Promise.resolve();
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

        it('failing to push with BundleAlreadyExistsError should call backend.pull only once', done => {
            let turn = 0;
            fakeBackends[0].backend.push = () => Promise.reject(new errors.BundleAlreadyExistsError());
            fakeBackends[0].backend.pull = () => {
                turn++;
                return Promise.reject(new errors.BundleNotFoundError);
            };

            assert.isRejected(install({config}), errors.BundleAlreadyExistsError).notify(done);
        });
    });
});

function checkMockResult(mocks, done, error) {
    if (error && error.name === 'ExpectationError') {
        return done(error);
    }

    try {
        mocks.map(mock => mock.verify());
    } catch (error) {
        return done(error);
    }

    done();
}
