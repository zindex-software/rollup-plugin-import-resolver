const path = require('path');
const fs = require('fs');

const localImport = /^[.]{1,2}\//;
const ignoreFiles = /\?/;

const pnp = process.versions.pnp ? require('pnpapi') : null;

function resolvePnP(importee, importer) {
    if (!pnp) {
        return null;
    }
    return pnp.resolveToUnqualified(importee, importer);
}

function isAlias(file, alias) {
    if (alias === file) {
        return true;
    }
    if (!file.startsWith(alias)) {
        return false;
    }
    return file[alias.length] === '/';
}

function getAlias(file, aliases) {
    for (const p in aliases) {
        if (aliases.hasOwnProperty(p) && isAlias(file, p)) {
            return p;
        }
    }
    return null;
}

function getExistingFileWithExt(file, extensions) {
    for (let i = 0; i < extensions.length; i++) {
        let f = file + extensions[i];
        if (fs.existsSync(f)) {
            return f;
        }
    }
    return null;
}

function fromPackageJson(dir, key = true) {
    if (key === true) {
        key = 'module';
    }

    const pkg = path.resolve(dir, '.', 'package.json');

    if (!fs.existsSync(pkg)) {
        return null;
    }

    try {
        const data = JSON.parse(fs.readFileSync(pkg));

        if (!data) {
            return null;
        }

        if (Array.isArray(key)) {
            for (let i = 0; i < key.length; i++) {
                if (!data.hasOwnProperty(key[i])) {
                    continue;
                }
                let f = path.resolve(dir, '.', data[key[i]]);
                if (fs.existsSync(f)) {
                    return f;
                }
            }
        } else if (data.hasOwnProperty(key)) {
            let f = path.resolve(dir, '.', data[key]);
            if (fs.existsSync(f)) {
                return f;
            }
        }

        return null;
    } catch (e) {
        return null;
    }
}

function resolveFile(file, extensions, index, packageJson = false) {
    if (fs.existsSync(file)) {
        if (!fs.statSync(file).isDirectory()) {
            // Consider it a file
            return file;
        }
        let f;
        // Check if package.json is present
        if (packageJson && (f = fromPackageJson(file, packageJson)) != null) {
            return f;
        }

        // There is a dir, also check if there isn't a file with extension
        // on the same level with dir
        f = getExistingFileWithExt(file, extensions);
        if (f !== null) {
            return f;
        }

        // Consider the file to be index.*
        file = path.resolve(file, '.', index);
    }

    // Try to get using extensions
    return getExistingFileWithExt(file, extensions);
}

module.exports = function rollupPluginImportResolver(options) {
    if (!options) {
        options = {extensions: ['.js'], alias: {}};
    }
    else {
        if (Array.isArray(options)) {
            options = {extensions: options};
        }
        if (!options.extensions) {
            options.extensions = ['.js'];
        }
        if (!options.alias) {
            options.alias = {};
        }
    }

    if (options.extensions.length === 0 && Object.keys(options.alias).length === 0) {
        return {};
    }

    if (!options.indexFile) {
        options.indexFile = 'index';
    }

    if (!options.modulesDir) {
        options.modulesDir = './node_modules';
    }

    const cache = options.cache || {};

    return {
        resolveId: function (importee, importer) {
            if (!importer || ignoreFiles.test(importee)) {
                return null;
            }

            let file = null;
            if (!localImport.test(importee)) {
                if (cache.hasOwnProperty(importee)) {
                    return cache[importee];
                }

                // Check for alias
                let alias = getAlias(importee, options.alias);
                if (alias === null) {
                    file = resolvePnP(importee, importer);
                    if (file == null) {
                        if (!options.modulesDir) {
                            return null;
                        }
                        file = path.resolve(options.modulesDir, importee);
                    }
                } else {
                    let aliasPath = options.alias[alias];
                    const isFsPath = aliasPath.length > 0 && (aliasPath[0] === '.' || aliasPath[0] === '/');

                    if (!isFsPath && pnp) {
                        file = resolvePnP(aliasPath, importer);
                    } else {
                        if (!isFsPath) {
                            aliasPath = alias + '/' + aliasPath;
                            if (options.modulesDir) {
                                aliasPath = path.resolve(options.modulesDir, aliasPath);
                            }
                        }

                        if (!fs.statSync(aliasPath).isDirectory()) {
                            return cache[importee] = aliasPath;
                        }

                        file = importee.substr(alias.length);
                        if (file !== '') {
                            file = '.' + file;
                        }
                        file = path.resolve(options.alias[alias], file);
                    }
                }
            }
            else {
                file = resolvePnP(importee, importer);
                if (file == null) {
                    // Local import is relative to importer
                    file = path.resolve(importer, '..', importee);
                }
            }

            if (!cache.hasOwnProperty(file)) {
                cache[file] = resolveFile(file, options.extensions, options.indexFile, options.packageJson);
            }

            return cache[file];
        }
    };
};
