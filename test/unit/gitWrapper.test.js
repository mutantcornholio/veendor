const gitWrapper = require('../../lib/commandWrappers/gitWrapper');
const helpers = require('../../lib/commandWrappers/helpers');

const _ = require('lodash');

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');

const assert = chai.assert;
chai.use(chaiAsPromised);

let config;

describe('gitWrapper', () => {
    let sandbox;

    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('.olderRevision', () => {
        it('should reject with TooOldRevisionError if file doen\'t have that amount of revisions', done => {
            sandbox.stub(helpers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args.some(arg => arg === '--pretty=format:"%h"')) {
                    return Promise.resolve('43485c2\n8638279\n12312a\n1231241\n');
                }

                return Promise.reject(new Error('mock me, bitch'));
            });

            const result = gitWrapper.olderRevision('test', 5);

            assert.isRejected(result, gitWrapper.TooOldRevisionError).notify(done);
        });

        it('should call git show with last line of git log output', done => {
            sandbox.stub(helpers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args.some(arg => arg === '--pretty=format:"%h"')) {
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'show') {
                    assert.equal(args[1], '8638279:test');

                    done();
                    return Promise.resolve('ok');
                }

                return Promise.reject(new Error('mock me, bitch'));
            });

            gitWrapper.olderRevision('test', 2);
        });

        it('should resolve with git show output', done => {
            sandbox.stub(helpers, 'getOutput').callsFake((executable, args) => {
                if (executable === 'git' && args.some(arg => arg === '--pretty=format:"%h"')) {
                    return Promise.resolve('43485c2\n8638279\n');
                } else if (executable === 'git' && args[0] === 'show') {
                    return Promise.resolve('this is elder file.\nShow some respect.\n');
                }

                return Promise.reject(new Error('mock me, bitch'));
            });

            const result = gitWrapper.olderRevision('test', 2);
            assert.becomes(result, 'this is elder file.\nShow some respect.\n').notify(done);
        });
    });
});
