import path from 'node:path';
import { build } from 'esbuild';

// Vapor's native bundler does not convert these CommonJS browser entries.
// Convert only at build time; keep the locked dependencies and their licenses.
const entries = { jszip: ['default'], 'gm-crypto': ['SM4'] };

export function appVendors() {
  const modules = new Map();
  let root;
  return {
    name: 'aio-app-vendors',
    enforce: 'pre',
    apply: () => process.env.UNI_PLATFORM === 'app',
    configResolved(config) { root = config.root; },
    // Native Vapor uses one IIFE; keep lazy GBK decoding in that bundle.
    outputOptions(output) {
      if (output.format === 'iife') return { ...output, manualChunks: undefined, inlineDynamicImports: true };
    },
    resolveId(source) {
      if (!entries[source]) return;
      const id = path.join(process.env.UNI_INPUT_DIR || root, 'node_modules/.aio-app-vendor', source + '.js');
      modules.set(id, source);
      return id;
    },
    async load(id) {
      const source = modules.get(id);
      if (!source) return;
      const result = await build({
        stdin: {
          contents: `export { ${entries[source].join(', ')} } from ${JSON.stringify(source)};`,
          resolveDir: root,
        },
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2017',
        legalComments: 'eof',
      });
      return { code: result.outputFiles[0].text, map: null };
    },
  };
}
