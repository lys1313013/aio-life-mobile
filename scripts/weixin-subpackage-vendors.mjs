import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const policy = JSON.parse(readFileSync(new URL('./weixin-package-policy.json', import.meta.url), 'utf8'));
const slash = value => value.replaceAll('\\', '/');

/**
 * uni's default npm vendor is in the main package, even for subpackage-only imports.
 * Bundle a private ESM copy per declared owner, then let Rollup keep it inside that
 * owner's vendor. The shared chart runtime uses its own asynchronous package.
 * No node_modules patches or checked-in vendor copies are needed.
 * Web and App retain their normal dependency resolution.
 */
export function weixinSubpackageVendors() {
  let root;
  let input;
  const virtual = new Map();
  const bundles = new Map();
  let roots = [];
  let chartRuntime;
  const owner = file => roots.find(root => file.startsWith(root + '/')) || '';
  return {
    name: 'aio-weixin-subpackage-vendors',
    enforce: 'pre',
    apply: () => process.env.UNI_PLATFORM === 'mp-weixin',
    configResolved(config) {
      root = config.root;
      input = slash(path.resolve(root, 'src'));
      const pages = JSON.parse(readFileSync(path.join(input, 'pages.json'), 'utf8'));
      roots = (pages.subPackages || []).map(pkg => pkg.root);
      for (const rule of Object.values(policy.scopedDependencies)) {
        for (const declared of rule.roots) {
          if (!roots.includes(declared)) throw new Error(`未声明的依赖分包：${declared}`);
        }
      }
    },
    async buildStart() {
      virtual.clear();
      bundles.clear();
      for (const name of ['report.json', 'report.txt', 'chunks.json']) {
        rmSync(path.join(root, 'artifacts/weixin-size', name), { force: true });
      }
      // Shared Cartesian engine is fetched with require.async, never synchronously
      // imported from the main package or another business subpackage.
      chartRuntime = await build({
        absWorkingDir: root,
        entryPoints: [policy.chartRuntime.entry],
        bundle: true, write: false, format: 'cjs', platform: 'browser',
        target: 'es2017', minify: true, legalComments: 'eof', metafile: true,
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      this.emitFile({ type: 'asset', fileName: `${policy.chartRuntime.root}/echarts.js`, source: chartRuntime.outputFiles[0].text });
      // WeChat requires one page even for a JS runtime package. This empty bootstrap
      // registration has no business navigation entry; require.async only loads JS.
      for (const [extension, source] of Object.entries({
        js: 'Page({});', json: '{"navigationStyle":"custom"}', wxml: '<view />', wxss: '',
      })) this.emitFile({ type: 'asset', fileName: `${policy.chartRuntime.root}/bootstrap.${extension}`, source });
    },
    resolveId(source, importer) {
      const rule = policy.scopedDependencies[source];
      if (!rule) return;
      const relative = slash(importer || '').replace(input + '/', '');
      const packageRoot = owner(relative);
      if (!rule.roots.includes(packageRoot)) {
        this.error(`重量依赖 ${source} 不能由 ${relative} 引入；请把使用方放入 ${rule.roots.join('、')}，不要提升至主包。`);
      }
      const name = source.replace(/[^a-zA-Z0-9_-]/g, '_');
      const id = `${input}/${packageRoot}/node_modules/.aio-vendor/${name}.js`;
      virtual.set(id, { source, rule, packageRoot });
      return id;
    },
    async load(id) {
      const entry = virtual.get(id);
      if (!entry) return;
      if (!bundles.has(entry.source)) {
        bundles.set(entry.source, build({
          absWorkingDir: root,
          stdin: {
            contents: `export { ${entry.rule.exports.join(', ')} } from ${JSON.stringify(entry.source)};`,
            resolveDir: root,
            sourcefile: `aio-vendor-${entry.source}.js`,
          },
          bundle: true,
          write: false,
          format: 'esm',
          platform: 'browser',
          target: 'es2017',
          legalComments: 'eof',
          metafile: true,
        }));
      }
      const result = await bundles.get(entry.source);
      for (const file of Object.keys(result.metafile.inputs)) {
        const absolute = path.resolve(root, file);
        if (file.includes('node_modules/')) this.addWatchFile(absolute);
      }
      return { code: result.outputFiles[0].text, map: null };
    },
    outputOptions(output) {
      const original = output.manualChunks;
      if (typeof original !== 'function') this.error('uni 分块配置已变化，请复核微信分包适配。');
      return {
        ...output,
        manualChunks(id, api) {
          const entry = virtual.get(id);
          return entry ? `${entry.packageRoot}/common/vendor` : original(id, api);
        },
      };
    },
    generateBundle: {
      order: 'post',
      handler(_options, output) {
        const app = output['app.json'];
        if (!app || app.type !== 'asset') this.error('缺少微信 app.json，无法登记图表引擎分包。');
        const config = JSON.parse(String(app.source));
        const packages = config.subPackages || config.subpackages || [];
        if (!packages.some(pkg => pkg.root === policy.chartRuntime.root)) {
          packages.push({ root: policy.chartRuntime.root, pages: ['bootstrap'] });
        }
        config.subPackages = packages;
        app.source = JSON.stringify(config, null, 2);
        roots.push(policy.chartRuntime.root);
        const chunks = Object.values(output).filter(file => file.type === 'chunk');
        const runtimeImports = new Map();
        // A subpackage may synchronously depend on itself or the main package only.
        for (const chunk of chunks) {
          const from = owner(chunk.fileName);
          // uni removes its synthetic page registration imports from app.js; inspect
          // emitted requires rather than Rollup's pre-rewrite imports metadata.
          const dependencies = [...chunk.code.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)]
            .map(match => match[1].startsWith('.')
              ? path.posix.normalize(path.posix.join(path.posix.dirname(chunk.fileName), match[1]))
              : match[1].replace(/^\//, ''));
          runtimeImports.set(chunk.fileName, dependencies);
          for (const dependency of dependencies) {
            const to = owner(dependency);
            if (to && to !== from) this.error(`非法跨分包依赖：${chunk.fileName} -> ${dependency}`);
          }
          for (const id of chunk.moduleIds) {
            const entry = virtual.get(id);
            if (entry && from !== entry.packageRoot) this.error(`分包依赖泄漏：${entry.source} -> ${chunk.fileName}`);
            // Detect alternate paths bypassing the scoped entry, e.g. xlsx/xlsx.mjs.
            const npmPath = slash(id).split('/node_modules/').at(-1);
            if (!from && /^(xlsx|jszip|gm-crypto|echarts|zrender)(\/|$)/.test(npmPath)) {
              this.error(`重量依赖进入主包：${npmPath} -> ${chunk.fileName}`);
            }
          }
        }
        const report = chunks.map(chunk => ({
          file: chunk.fileName,
          bytes: Buffer.byteLength(chunk.code),
          imports: runtimeImports.get(chunk.fileName),
          rollupImports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          modules: Object.entries(chunk.modules).map(([id, info]) => ({
            id: slash(path.relative(root, id)),
            bytes: info.renderedLength,
          })).sort((a, b) => b.bytes - a.bytes),
        })).sort((a, b) => b.bytes - a.bytes);
        report.push({
          file: `${policy.chartRuntime.root}/echarts.js`, bytes: chartRuntime.outputFiles[0].contents.length,
          imports: [], rollupImports: [], dynamicImports: [],
          modules: Object.entries(chartRuntime.metafile.inputs).map(([id, info]) => ({ id, bytes: info.bytes })).sort((a, b) => b.bytes - a.bytes),
        });
        const directory = path.join(root, 'artifacts/weixin-size');
        mkdirSync(directory, { recursive: true });
        writeFileSync(path.join(directory, 'chunks.json'), JSON.stringify(report, null, 2) + '\n');
      },
    },
  };
}
