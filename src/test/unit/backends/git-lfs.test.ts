import {describe, it, beforeEach, afterEach} from 'mocha';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import mockfs from 'mock-fs';
import path from 'path';

import * as errors from '@/lib/errors';
import * as tarWrapper from '@/lib/commandWrappers/tarWrapper';
import * as gitWrapper from '@/lib/commandWrappers/gitWrapper';
import * as gitLfs from '@/lib/backends/git-lfs';
import {GitLfsOptions} from '@/lib/backends/git-lfs';

const assert = chai.assert;
chai.use(chaiAsPromised);


let fakeRepo: string;
let sandbox: sinon.SinonSandbox;
let fakeHash: string;
let defaultOptions: GitLfsOptions;

describe('git-lfs', () => {
    beforeEach(() => {
        mockfs({
            '.veendor': {
                'git-lfs.0': {}
            },
        });

        fakeRepo = 'git://fakehub.com/test/test.git';
        fakeHash = '1234567890deadbeef1234567890';
        sandbox = sinon.sandbox.create();

        defaultOptions = {
            repo: fakeRepo,
            compression: 'gzip',
            defaultBranch: 'defaultBranchaster',
            checkLfsAvailability: false,
        };

        gitLfs.setRemoteFreshness(false);

        sandbox.stub(gitWrapper, 'clone').resolves();
        sandbox.stub(gitWrapper, 'fetch').resolves();
        sandbox.stub(gitWrapper, 'checkout').resolves();
        sandbox.stub(gitWrapper, 'add').resolves();
        sandbox.stub(gitWrapper, 'commit').resolves();
        sandbox.stub(gitWrapper, 'tag').resolves();
        sandbox.stub(gitWrapper, 'push').resolves();
        sandbox.stub(gitWrapper, 'isGitRepo').resolves(true);
        sandbox.stub(gitWrapper, 'resetToRemote').resolves();
        sandbox.stub(gitWrapper, 'isGitLfsAvailable').resolves();
        sandbox.stub(gitWrapper, 'lfsPull').resolves();
        sandbox.stub(tarWrapper, 'createArchive').resolves();
        sandbox.stub(tarWrapper, 'extractArchive').resolves();
    });

    afterEach(() => {
        mockfs.restore();
        sandbox.restore();
    });

    describe('.pull', () => {
        it('clones repo to cache directory if isn\'t already there', async () => {
            // @ts-ignore
            gitWrapper.isGitRepo.restore(); gitWrapper.clone.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('isGitRepo').resolves(false);
            mock.expects('clone').withArgs(fakeRepo, sinon.match('.veendor/git-lfs.0/repo')).resolves('');

            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');

            mock.verify();
        });

        it('runs `fetch` if repo already exist', async () => {
            // @ts-ignore
            gitWrapper.fetch.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('fetch').withArgs(sinon.match('.veendor/git-lfs.0/repo')).resolves('');

            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('checks out tag by passed hash', async () => {
            // @ts-ignore
            gitWrapper.checkout.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('checkout').withArgs(sinon.match('.veendor/git-lfs.0/repo'), 'veendor-' + fakeHash);

            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').catch(() => {});
            mock.verify();
        });

        it('rejects with BundleNotFoundError if tag not found', () => {
            // @ts-ignore
            gitWrapper.checkout.restore();
            sandbox.stub(gitWrapper, 'checkout').rejects(new Error);

            return assert.isRejected(
                gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0'), errors.BundleNotFoundError
            );
        });

        it('does not run tar if tag not found', async ()  => {
            // @ts-ignore
            gitWrapper.checkout.restore(); tarWrapper.extractArchive.restore();
            sandbox.stub(gitWrapper, 'checkout').rejects(new Error);

            const mock = sandbox.mock(tarWrapper);
            mock.expects('extractArchive').never();
            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0').catch(() => {});

            mock.verify();
        });

        it('unpacks the archive to $(pwd)', async () => {
            // @ts-ignore
            tarWrapper.extractArchive.restore();
            const mock = sandbox.mock(tarWrapper);
            mock.expects('extractArchive').withArgs(sinon.match(`.veendor/git-lfs.0/repo/${fakeHash}.tar.gz`));

            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('should run git fetch only once in a run', async () => {
            // @ts-ignore
            gitWrapper.fetch.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('fetch').once().resolves('');

            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');

            mock.verify();
        });

        it('should run git lfs pull if git lfs is available', async () => {
            // @ts-ignore
            gitWrapper.lfsPull.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('lfsPull').withArgs(sinon.match('.veendor/git-lfs.0/repo')).resolves('');

            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('should not run git lfs pull if git lfs is not available', async () => {
            // @ts-ignore
            gitWrapper.isGitLfsAvailable.restore(); gitWrapper.lfsPull.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('isGitLfsAvailable').rejects(gitWrapper.GitLfsNotAvailableError);
            mock.expects('lfsPull').never();

            await gitLfs.pull(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });
    });

    describe('.push', () => {
        it('clones repo to cache directory if isn\'t already there', async () => {
            // @ts-ignore
            gitWrapper.clone.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('clone').withArgs(fakeRepo, sinon.match('.veendor/git-lfs.0/repo')).resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('runs `fetch` if repo already exist', async () => {
            mockfs({
                '.veendor': {
                    'git-lfs.0': {
                        repo: {
                            '.git': {}
                        }
                    }
                },
            });

            // @ts-ignore
            gitWrapper.fetch.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('fetch').withArgs(sinon.match('.veendor/git-lfs.0/repo')).resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('checks out default branch', async () => {
            // @ts-ignore
            gitWrapper.checkout.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('checkout')
                .withArgs(sinon.match('.veendor/git-lfs.0/repo'), defaultOptions.defaultBranch).resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('resets branch to remote state', async () => {
            // @ts-ignore
            gitWrapper.resetToRemote.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('resetToRemote')
                .withArgs(sinon.match('.veendor/git-lfs.0/repo'), defaultOptions.defaultBranch).resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('archives node_modules', async () => {
            // @ts-ignore
            tarWrapper.createArchive.restore();
            const mock = sandbox.mock(tarWrapper);
            mock.expects('createArchive')
                .withArgs(
                    sinon.match(`.veendor/git-lfs.0/repo/${fakeHash}`),
                    [path.resolve(process.cwd(), 'node_modules')],
                    defaultOptions.compression
                ).resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('adds archive to staging', async () => {
            // @ts-ignore
            gitWrapper.add.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('add')
                .withArgs(
                    sinon.match('.veendor/git-lfs.0/repo'),
                    [sinon.match(`.veendor/git-lfs.0/repo/${fakeHash}.tar.gz`)]
                ).resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('creates commit', async () => {
            // @ts-ignore
            gitWrapper.commit.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('commit')
                .withArgs(sinon.match('.veendor/git-lfs.0/repo'), sinon.match.any).resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('creates tag with hash name', async () => {
            // @ts-ignore
            gitWrapper.tag.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('tag')
                .withArgs(sinon.match('.veendor/git-lfs.0/repo'), `veendor-${fakeHash}`).resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('pushes tag', async () => {
            // @ts-ignore
            gitWrapper.push.restore();
            const mock = sandbox.mock(gitWrapper);
            mock.expects('push')
                .withArgs(sinon.match('.veendor/git-lfs.0/repo'), `veendor-${fakeHash}`)
                .resolves('');

            await gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');
            mock.verify();
        });

        it('throws BundleAlreadyExistsError if git tag rejected with RefAlreadyExistsError', () => {
            // @ts-ignore
            gitWrapper.tag.restore();
            sandbox.stub(gitWrapper, 'tag').rejects(new gitWrapper.RefAlreadyExistsError);

            const result = gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');

            return assert.isRejected(result, errors.BundleAlreadyExistsError);
        });

        it('throws BundleAlreadyExistsError if git push rejected with RefAlreadyExistsError', () => {
            // @ts-ignore
            gitWrapper.push.restore();
            sandbox.stub(gitWrapper, 'push').rejects(new gitWrapper.RefAlreadyExistsError);

            const result = gitLfs.push(fakeHash, defaultOptions, '.veendor/git-lfs.0');

            return assert.isRejected(result, errors.BundleAlreadyExistsError);
        });
    });

    describe('.validateOptions', () => {
        it('throws error if `repo` hasn\'t been passed', () => {
            delete defaultOptions.repo;

            return assert.isRejected(gitLfs.validateOptions(defaultOptions), errors.InvalidOptionsError);
        });

        it('checks valid compression', () => {
            // @ts-ignore
            defaultOptions.compression = 'lsda';

            return assert.isRejected(gitLfs.validateOptions(defaultOptions), errors.InvalidOptionsError);
        });

        it('sets default compression type to `gzip`', async () => {
            delete defaultOptions.compression;

            await gitLfs.validateOptions(defaultOptions);
            assert.equal(defaultOptions.compression, 'gzip');
        });

        it('sets default default branch to `master`', async () => {
            delete defaultOptions.defaultBranch;

            await gitLfs.validateOptions(defaultOptions);
            assert.equal(defaultOptions.defaultBranch, 'master');
        });

        it('checks if checkLfsAvailability is boolean', () => {
            // @ts-ignore
            defaultOptions.checkLfsAvailability = 'test';

            return assert.isRejected(gitLfs.validateOptions(defaultOptions), errors.InvalidOptionsError);
        });

        it('sets default checkLfsAvailability to `false`', async () => {
            await gitLfs.validateOptions(defaultOptions);
            assert.equal(defaultOptions.checkLfsAvailability, false);
        });

        it('rejects with `GitLfsNotAvailableError` if git lfs is not available ' +
            'and `checkLfsAvailability` was set to \'true\'', () => {
            defaultOptions.checkLfsAvailability = true;

            // @ts-ignore
            gitWrapper.isGitLfsAvailable.restore();
            sandbox.stub(gitWrapper, 'isGitLfsAvailable').rejects(new gitWrapper.GitLfsNotAvailableError);

            return assert.isRejected(gitLfs.validateOptions(defaultOptions), gitWrapper.GitLfsNotAvailableError);
        })
    })
});
