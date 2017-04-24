const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const fsz = require('mz/fs');
const path = require('path');
const _ = require('lodash');

const install = require('../../lib/install');
const pkgJson = require('../../lib/pkgjson');
const gitWrapper = require('../../lib/gitWrapper');
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
            'node_modules': {}
        });

        const result = install({pkgJson: PKGJSON});

        assert.isRejected(result, install.NodeModulesAlreadyExistError).notify(done);
    });

    it('should delete node_modules, if force option is used', done => {
        mockfs({
            'node_modules': {}
        });

        const nodeModules = path.join(process.cwd(), 'node_modules');

        sandbox.spy(fsz, 'rmdir');

        const result = install({pkgJson: PKGJSON, force: true, config: {backends: fakeBackends}}).then(() => {
            assert(fsz.rmdir.calledWith(nodeModules));
            done();
        }, done);
    });

    it('should fail if pkgJson is not supplied', done => {
        const result = install({});

        assert.isRejected(result, install.EmptyPkgJsonError).notify(done);
    });

    it('should call pkgjson with package.json contents first', done => {
        sandbox.spy(pkgJson, 'calcHash');

        const result = install({pkgJson: PKGJSON, config: {backends: fakeBackends}}).then(() => {
            assert(pkgJson.calcHash.calledWith(PKGJSON));
            done();
        }, done);
    });

    it('should call `pull` on all backends until any backend succedes', done => {
        sandbox.stub(pkgJson, 'calcHash').returns(fakeSha1);

        install({
            pkgJson: PKGJSON,
            config: {backends: fakeBackends}
        }).then(() => {
            assert(fakeBackends[0].pull.calledWith(fakeSha1));
            assert(fakeBackends[1].pull.calledWith(fakeSha1));
            done();
        }, done);
    });

    it('should reject with BundlesNotFoundError if no backend succeded with pull', done => {
        sandbox.stub(pkgJson, 'calcHash').returns(fakeSha1);

        const result = install({
            pkgJson: PKGJSON,
            config: {backends: [fakeBackends[0], fakeBackends[0]]}
        });

        assert.isRejected(result, install.BundlesNotFoundError).notify(done);
    });

    xit('should look in useGitHistory.depth entries', (done) => {
        const fakePkgJson1 = Object.assign({}, PKGJSON);
        fakePkgJson1.dependencies.c = '2.2.8';

        const fakePkgJson2 = Object.assign({}, PKGJSON);
        fakePkgJson1.dependencies.c = '2.1.8';

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

        sandbox.mock(gitWrapper, 'olderRevision').callsFake((filename, age) => {
            if (age === 2) {
                return Promise.resolve(JSON.stringify(fakePkgJson1));
            } else if (age === 3) {
                return Promise.resolve(JSON.stringify(fakePkgJson2));
            }
        });

        const result = install({
            pkgJson: PKGJSON,
            config: {backends: [fakeBackends[0]]},
            useGitHistory: {
                depth: 2
            }
        });

        assert(gitWrapper.olderRevision.calledWith('package.json', 2));
        assert(gitWrapper.olderRevision.calledWith('package.json', 3));
    });

    xit('should call pkgjson with older package.json revision');
    xit('should call `pull` on backends with gitWrapper.olderRevision\'s hash');

    xit('should not call gitWrapper.olderRevision if useGitHistory.depth is not defined');
    xit('should not call gitWrapper.olderRevision if not in git repo');

    xit('should call `npmWrapper.install` with diff between package.json\'s after successful pull of history bundle');
    xit('should call `push` on a backend with push: true option after partial npm install');

    xit('should call `npmWrapper.installAll` if no backend succeded');
    xit('should not call `npmWrapper.installAll` if fallbackToNpm set to false');
    xit('should call `push` on a backend with push: true option after npm install');
});
