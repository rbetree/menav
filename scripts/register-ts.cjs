const { transformSync } = require('esbuild');
const fs = require('fs');
const Module = require('module');

const originalLoader = Module._extensions['.js'];

Module._extensions['.ts'] = function tsLoader(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = transformSync(source, {
    loader: 'ts',
    sourcefile: filename,
    format: 'cjs',
    target: 'node22',
    define: {
      'import.meta.url': JSON.stringify(`file://${filename}`),
    },
  });
  module._compile(result.code, filename);
};
