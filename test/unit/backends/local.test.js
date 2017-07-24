const {describe, it, beforeEach, afterEach} = require('mocha');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const mockfs = require('mock-fs');
const path = require('path');

const assert = chai.assert;
chai.use(chaiAsPromised);

const local = require('../../../lib/backends/local');
const tarWrapper = require('../../../lib/commandWrappers/tarWrapper');
const errors = require('../../../lib/backends/errors');

describe('local', () => {
    describe('pull', () => {
        xit('should look for archive in target directory');
        xit('should unpack archive to pwd');
    });

    describe('push', () => {
        xit('should pack node_modules to target directory');
    })
});
