# veendor
A tool for storing your npm dependencies in arbitrary storage

### Features
Veendor: 
* caches your `node_modules` in you-define-where.
* bootstraps your deps **fast**. 
* only installs deps that have changed, effectively locking your deps.
* provides multi-layered cache.
* supports caching in git and local directory out-of-the-box.
* supports customizing cache keys calculation.

### How it works
It calculates SHA-1 of `dependencies` and `devDependencies` in your `package.json`,
then searches for that hash in `backends` (cache providers).  
If you commit your `package-lock.json` or `npm-shrinkwrap.json`, it contents will be hashed too.  
If found, veendor downloads archive and unpacks your `node_modules`. Voila!  
If not, veendor looks at previous revisions of your `package.json` and
tries to find older bundles, then installs only deps that have changed.  
After that, veendor uploads new bundle to all `backends`.   
If older bundles not found, veendor does clean `npm install` and
pushes bundle for future use.

### Installation and use
Install veendor globally:
```
npm install -g veendor
```

Go to your project and add a config file (`.veendor.js` or `.veendor.json`).
See section about config file below.  
Run `veendor install`.  
That's all!

### Config file
Veendor supports configs as nodejs-modules or JSON-files.  
Config file contains these sections:

#### backends
Required.  
Define your caches here. `backends` property is an array of objects.  
Bundles search/upload will be in order defined here.  
Each object has this format: 
```js
{
    alias: 'some_name', // Required, choose any name you like.
    backend: 'local', // String or module. See built-in backends and backend API sections.
    push: true, // Optional, defaults to `false`. Should bundles be pushed to this backend.
    pushMayFail: true // Optional, defaults to `false`.
                      // `veendor install` won't fail if push to backend fails.
    options: {} // Backend-specific options.
}
```

#### packageHash
Optional, object.  
Used to extend cache key calculation.  
Right now, only `suffix` property is used.  
`suffix` may be string or function that returns string.  
Examples: 
```js
// Suffix by arch.
// Hashes will look like this: d0d5f10c199f507ea6e1584082feea229d59275b-darwin
packageHash: {
    suffix: process.platform
}
```

```js
// Suffix by arch and node api version
// d0d5f10c199f507ea6e1584082feea229d59275b-darwin-46
packageHash: {
    suffix: process.platform + '-' + process.versions.modules
}
```

```js
// Invalidate every month
// d0d5f10c199f507ea6e1584082feea229d59275b-2017-7
packageHash: {
    suffix: () => {
        const date = new Date();
        return date.getFullYear() + '-' + date.getMonth();
    }
}
```

#### installDiff
Optional, defaults to `true`. Enables diff installation.

#### fallbackToNpm
Optional, defaults to `true`.  
If true, runs `npm install` when bundle is not found.  
Use this if you want to lock deps with veendor.  
Should either be environmental-dependent or your backends should be populated manually.

#### useGitHistory
Optional.  
If contains `depth` property with number value, will look at  
that amount of git revisions of package.json.  
Note that only changes that affect dependencies and devDependencies count.  
Example:
```js
useGitHistory: {
    depth: 5
}
```

#### npmVersion
Optional.  
Semver constraint on npm. Veendor will crash if npm version is incompatible.  
Example:
```js
npmVersion: '^5'
```

#### veendorVersion
Optional.  
Semver constraint on veendor itself.  
Use it if you want to force your team to update veendor and prohibit pushing of bundles created by older versions of veendor.  
Example:  
```js
veendorVersion: '>=2.1'
```

#### dedupe
Optional, defaults to `false`
Run `npm dedupe` after each diff install (it doesn't make any sense to run `dedupe` after full install).
When adding new packages to existing pile, NPM doesn't do a very good job keeping your `node_modules` in check.
That way, if you've been using diff installations for a long time, you might discover a lot of library duplicates.
Sometimes you might even get nonfunctional bundles. `dedupe` helps.

Example:
```js
dedupe: true
```

Please notice that `veendorVersion` option is not supported in veendor before 2.0, so if your team might use 1.x, add this to your .veendor.js:
```js
if (!global.VEENDOR_VERSION) {
    throw new Error('veendor version is incompatible, please update');
}
```

### Built-in backends
#### http
Read-only HTTP backend.  
Designed for anonymous access; you should upload your bundles some other way;  
Accepts these options: 
```js
{
    resolveUrl: hash => {  // Required. Function for getting remote url for given hash.
                           // Returns string or Promise<string>.
        return `https://someserver.org/${hash}.tar.gz`;
    }, 
                                                                 
    compression: 'xz', // Optional, defaults to 'gzip'. Also supports 'bzip2', 'xz'.
    strict: true // Optional, defaults to false. 
                 // If true, all codes other than 404 and 200 will abort installation.
}
```

#### s3
Stores bundles in Amazon S3 bucket.  

Accepts these options: 
```js
{
    bucket: 'veendor', // Required, name of S3 bucket. Bucket should already exist.
    s3Options: { // Optional, options for AWS-SDK (see below)
        endpoint: 'localhost:14569'
    },
    objectAcl: 'authenticated-read', // Optional, defaults to your bucket settings. 
                                     // ACL for created objects. See below. 
    compression: 'xz', // Optional, defaults to 'gzip'. Also supports 'bzip2', 'xz'.
}
```

veendor uses [aws-sdk](https://www.npmjs.com/package/aws-sdk) for s3 backend.  
`s3Options` is [AWS.Config](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Config.html#constructor-property)
options hash, and may contain all of listed options.  
`objectAcl` is `ACL` parameter passed to `S3.upload()`.
Check [the docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property).  

You can use any of [these](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html)
methods to set your credentials.  
Also, you can directly pass `accessKeyId` and `secretAccessKey` params to `s3Options`.  

#### git-lfs
Stores bundles in git repo.  
Accepts these options: 
```js
{
    repo: 'git@github.com:you/your-vendors.git', // Required. Git remote.
    compression: 'xz', // Optional, defaults to 'gzip'. Also supports 'bzip2', 'xz'.
    defaultBranch: 'braanch', // Default branch of your repo. Defaults to 'master'.
    checkLfsAvailability: true // Prevent veendor from running if git-lfs is not installed. 
                               // Optional, defaults to `false`. 
}
```
Note: while supporting git-lfs is not mandatory for your remote,
it's pretty much required due to future repo size regressions.  
Don't forget to set it up — add following to your `.gitattributes`:
```
*.tar.gz filter=lfs diff=lfs merge=lfs -text
```
(replace `.tar.gz` with your selected compressison format)  
[more about git-lfs](git-lfs.github.com)

#### local
Stores bundles in local directory  
Accepts these options: 
```js
{
    directory: '/var/cache/veendor', // Required. Directory to store bundles in.
    compression: 'xz' // Optional, defaults to 'gzip'. Also supports 'bzip2', 'xz'.
}
```

#### Example config
```js
const path = require('path');

module.exports = {
    backends: [
        {
            alias: 'local',
            push: true,
            backend: 'local',
            options: {
                directory: path.resolve(process.env.HOME, '.veendor-local')
            }
        },
        {
            alias: 'github',
            push: true,
            backend: 'git-lfs',
            options: {
                repo: 'git@github.com:you/your-vendors.git'
            }
        }
    ],
    useGitHistory: {
        depth: 5
    }
};

```

### Backends API
Backend should be an object with these properties:
#### pull(hash, options, cacheDir) => Promise
Should search for bundle with provided hash and
place node_modules into `process.cwd()`.
Promise resolves if succeded, rejects if not.  
Promise must be rejected with `require('veendor/lib/errors').BundleNotFoundError`
if bundles not found, or with any other error on generic fail. 
Failing with generic fail crash veendor.  
Options is object called `backend-specific options` earlier.  
If backend needs to store some temp data,
veendor provides a clean `cacheDir`
#### push(hash, options, cacheDir) => Promise
Should take node_modules from `process.cwd()` and  
upload it to the remote as bundle with `hash`.  
`options` and `cacheDir` are same as in `pull`.  
Promise resolves if succeded, rejects if not.  
Promise must be rejected with `require('veendor/lib/errors').BundleAlreadyExistsError`
if can't push because there's another bundle there.  
This is common race-condition and veendor will re-pull new bundle on this error.   
#### validateOptions(options) => undefined|Promise
Called upon start while validating config.  
May be synchronous or asynchronous.  
Should throw error or reject returning promise if backend-specific options in config
are invalid.  
If backend has some external dependencies, their availability may be checked here too.  
May mutate options to set default values.  
#### keepCache
Boolean, optional, defaults to false.  
If your backend needs old calls cache for sake of efficiency, set it to true.
Otherwise, `cacheDir` will be clean before every call.
