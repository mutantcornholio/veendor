const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const fsz = require('mz/fs');
const path = require('path');
const _ = require('lodash');

const install = require('../../lib/install');
const pkgJson = require('../../lib/pkgjson');
const gitWrapper = require('../../lib/commandWrappers/gitWrapper');
const backendsErrors = require('../../lib/backends/errors');

const assert = chai.assert;
chai.use(chaiAsPromised);

const PKGJSON = {
    dependencies: {
        foo: '2.2.8'
    },
    devDependencies: {
        baz: '6.6.6'
    }
};

const fakeSha1 = '1234567890deadbeef1234567890';

let sandbox;
let fakeBackends;

describe('install', () => {
    beforeEach(() => {
        mockfs();
        sandbox = sinon.sandbox.create();

        fakeBackends = [
            {
                pull: sandbox.spy(pkgJson => Promise.reject(new backendsErrors.BundleNotFoundError))
            },
            {
                pull: sandbox.spy(pkgJson => Promise.resolve())
            },
        ];
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    it('should fail if node_modules already exist', done => {
        mockfs({
            'node_modules': {},
            'package.json': JSON.stringify(PKGJSON)
        });

        const result = install({config: {}});

        assert.isRejected(result, install.NodeModulesAlreadyExistError).notify(done);
    });

    it('should delete node_modules, if force option is used', done => {
        mockfs({
            'node_modules': {},
            'package.json': JSON.stringify(PKGJSON)
        });

        const nodeModules = path.join(process.cwd(), 'node_modules');

        sandbox.spy(fsz, 'rmdir');

        const result = install({force: true, config: {backends: fakeBackends}}).then(() => {
            assert(fsz.rmdir.calledWith(nodeModules));
            done();
        }, done);
    });

    it('should fail if pkgJson is not supplied', done => {
        const result = install({config: {}});

        assert.isRejected(result).notify(done);
    });

    it('should call pkgjson with package.json contents first', done => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        sandbox.spy(pkgJson, 'calcHash');

        const result = install({config: {backends: fakeBackends}}).then(() => {
            assert(pkgJson.calcHash.calledWith(PKGJSON));
            done();
        }, done);
    });

    it('should call `pull` on all backends until any backend succedes', done => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        sandbox.stub(pkgJson, 'calcHash').returns(fakeSha1);

        install({
            config: {backends: fakeBackends}
        }).then(() => {
            assert(fakeBackends[0].pull.calledWith(fakeSha1));
            assert(fakeBackends[1].pull.calledWith(fakeSha1));
            done();
        }, done);
    });

    it('should reject with BundlesNotFoundError if no backend succeded with pull', done => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        sandbox.stub(pkgJson, 'calcHash').returns(fakeSha1);

        const result = install({
            config: {backends: [fakeBackends[0], fakeBackends[0]]}
        });

        assert.isRejected(result, install.BundlesNotFoundError).notify(done);
    });

    it('should look in useGitHistory.depth entries', (done) => {
        mockfs({
            'package.json': JSON.stringify(PKGJSON)
        });

        let fakePkgJson1 = _.cloneDeep(PKGJSON);
        fakePkgJson1.dependencies.c = '2.2.8';

        let fakePkgJson2 = _.cloneDeep(PKGJSON);
        fakePkgJson2.dependencies.c = '2.1.8';

        sandbox.stub(pkgJson, 'calcHash').callsFake(_pkgJson => {
            if (_.isEqual(_pkgJson, fakePkgJson1)) {
                return 'fakePkgJson1Hash';
            } else if (_.isEqual(_pkgJson, fakePkgJson2)) {
                return 'fakePkgJson2Hash';
            } else if (_.isEqual(_pkgJson, PKGJSON)) {
                return 'PKGJSONHash';
            }

            throw new Error('Something is unmocked');
        });

        const gitWrapperMock = sandbox.mock(gitWrapper);

        gitWrapperMock.expects('olderRevision')
            .withArgs(sinon.match(/package\.json$/), 2)
            .resolves(JSON.stringify(fakePkgJson1));

        gitWrapperMock.expects('olderRevision')
            .withArgs(sinon.match(/package\.json$/), 3)
            .resolves(JSON.stringify(fakePkgJson2));

        const result = install({
            config: {
                backends: [fakeBackends[0]],
                useGitHistory: {
                    depth: 2
                }
            }
        });

        const checkResult = () => {
            try {
                gitWrapperMock.verify();
            } catch (error) {
                return done(error);
            }

            done();
        };

        result.then(checkResult, checkResult);
    });

    xit('should call pkgjson with older package.json revision');
    xit('should call `pull` on backends with gitWrapper.olderRevision\'s hash');

    xit('should not call gitWrapper.olderRevision if useGitHistory.depth is not defined');
    xit('should not call gitWrapper.olderRevision if not in git repo');

    xit('should call `npmWrapper.install` with diff between package.json\'s after successful pull of history bundle');
    xit('should call `push` on all backends with push: true option after partial npm install');

    xit('should call `npmWrapper.installAll` if no backend succeded');
    xit('should not call `npmWrapper.installAll` if fallbackToNpm set to false');
    xit('should call `push` on all backends with push: true option after npm install');
});
