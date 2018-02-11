'use strict';

const {describe, it, before, after} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const fsExtra = require('fs-extra');
const path = require('path');
const tracer = require('tracer');

const helpers = require('../../lib/commandWrappers/helpers');
const logger = require('../../lib/logger');

const assert = chai.assert;
chai.use(chaiAsPromised);

/**
 * This is just for test runner.
 * Test cases are written in bash.
 */

const testScript = 'test/integration/runTest.sh';

describe('veendor install', function () {
    this.timeout(11000);

    before(() => {
        logger.setLogger(tracer.console({level: 6}));
    });

    it('shoud pull node_modules from git repo', done => {
        runBashTest('gitPull', done);
    });

    it('shoud push archive to git repo', done => {
        runBashTest('gitPush', done);
    });

    it('shoud pull node_modules from local directory', done => {
        runBashTest('localPull', done);
    });

    it('shoud copy archive to local directory', done => {
        runBashTest('localPush', done);
    });
});

describe('veendor calc', function () {
    this.timeout(5000);

    before(() => {
        logger.setLogger(tracer.console({level: 6}));
    });

    it('shoud return hash on package.json', done => {
        runBashTest('calcHashPlain', done);
    });

    xit('shoud return hash on package.json + package-lock.json', done => {
        runBashTest('calcHashWithPackageLock', done);
    });

    xit('shoud return hash on package.json + npm-shrinkwrap.json', done => {
        runBashTest('calcHashWithShrinkWrap', done);
    });

    xit('shoud return hash on package.json + yarn.lock', done => {
        runBashTest('calcHashWithYarnLock', done);
    });
});



function runBashTest(testCase, done) {
    const testDir = path.resolve(process.cwd(), 'test', 'integration', 'tmp', testCase);
    return helpers
        .getOutput('bash', ['-x', testScript, testCase, testDir], {timeout: 10000})
        .then(() => {
            done();
        }, (error) => {
            if (error.output) {
                const outPath = path.resolve(testDir, 'output.txt');
                fsExtra.ensureDirSync(testDir);
                fsExtra.writeFileSync(outPath, error.output);
                error.message += `. Output saved to ${outPath}`;
            }
            done(error);
        })
}
