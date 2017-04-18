'use strict';

const path = require('path');
const fs = require('mz/fs');

const helpers = require('./helpers');

class NotAGitRepoError extends Error {}
class GitIsNotADirectoryError extends Error {}


module.exports = {
    isGitRepo: directory => {
        return new Promise((resolve, reject) => {
            fs.stat(path.resolve(directory, '.git'))
                .then((error, stats) => {
                    if (error) {
                        reject (new NotAGitRepoError(error.code));
                    } else if (stats.isDirectory()) {
                        helpers.checkStatus('git', ['rev-parse', '--git-dir'], 500)
                            .then(resolve, () => {reject(new NotAGitRepoError)});
                    } else {
                        reject(new GitIsNotADirectoryError('.git is not a directory'));
                    }
                })
        });
    },
    NotAGitRepoError,
    GitIsNotADirectoryError,
};
