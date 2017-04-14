const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const fsz = require('mz/fs');
const path = require('path');

const install = require('../../lib/install');
const pkgJson = require('../../lib/pkgjson');

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


describe('install', () => {
    beforeEach(() => {
        mockfs();
    });

    afterEach(mockfs.restore);

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

        sinon.spy(fsz, 'rmdir');

        const result = install({pkgJson: PKGJSON, force: true}).then(() => {
            assert(fsz.rmdir.calledWith(nodeModules));
            done();
        }, done);
    });

    it('should fail if pkgJson is not supplied', done => {
        const result = install({});

        assert.isRejected(result, install.EmptyPkgJsonError).notify(done);
    });

    it('should call pkgjson with package.json contents first', done => {
        sinon.spy(pkgJson, 'calcHash');

        const result = install({pkgJson: PKGJSON}).then(() => {
            assert(pkgJson.calcHash.calledWith(PKGJSON));
            done();
        }, done);
    });

    xit('should call `pull` on all backends until any backend succedes');

    xit('should look in useGitHistory.depth entries');

    xit('should call `npmWrapper.install` with diff between package.json\'s after successful pull of history bundle');
    xit('should call `push` on a backend with push: true option after partial npm install');

    xit('should call `npmWrapper.installAll` if no backend succeded');
    xit('should not call `npmWrapper.installAll` if fallbackToNpm set to false');
    xit('should call `push` on a backend with push: true option after npm install');
});
