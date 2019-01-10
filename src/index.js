const path = require('path');
const fs = require('fs');

const localImport = /^[.]{1,2}\//;
const ignoreFiles = /\?/;

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

function resolveFile(file, extensions, index) {
    if (fs.existsSync(file)) {
        if (!fs.statSync(file).isDirectory()) {
            // Consider it a file
            return file;
        }
        // There is a dir, also check if there isn't a file with extension
        // on the same level with dir
        let f = getExistingFileWithExt(file, extensions);
        if (f !== null) {
            return f;
        }

        // Consider the file to be index.*
        file = path.resolve(file, '.', indexFile);
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
                // Check for alias
                let alias = getAlias(importee, options.alias);
                if (alias === null) {
                    if (!options.modulesDir) {
                        return null;
                    }
                    file = path.resolve(options.modulesDir, importee);
                } else {
                    file = importee.substr(alias.length);
                    if (file !== '') {
                        file = '.' + file;
                    }
                    file = path.resolve(options.alias[alias], file);
                }
            }
            else {
                // Local import is relative to importer
                file = path.resolve(importer, '..', importee);
            }

            if (!cache.hasOwnProperty(file)) {
                 cache[file] = resolveFile(file, options.extensions, options.indexFile);
            }

            return cache[file];
        }
    };
};
