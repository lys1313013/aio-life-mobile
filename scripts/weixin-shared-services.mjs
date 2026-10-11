import { readFileSync } from 'node:fs';
import path from 'node:path';

// Only reviewed, stateless helpers belong here. Session/cache singletons must
// continue resolving to the original main-package module.
export function weixinSharedServices() {
  let input;
  let roots;
  let sources;
  const copies = new Map();
  const slash = value => value.replaceAll('\\', '/');
  return {
    name: 'aio-weixin-shared-services',
    enforce: 'pre',
    apply: () => process.env.UNI_PLATFORM === 'mp-weixin',
    configResolved(config) {
      input = slash(path.resolve(config.root, 'src'));
      roots = JSON.parse(readFileSync(path.join(input, 'pages.json'), 'utf8')).subPackages.map(pkg => pkg.root);
      const policy = JSON.parse(readFileSync(path.resolve(config.root, 'scripts/weixin-package-policy.json'), 'utf8'));
      sources = new Set(policy.scopedSharedServices);
    },
    buildStart() { copies.clear(); },
    async resolveId(source, importer) {
      if (!importer) return;
      const original = copies.get(importer);
      const absolute = source.startsWith('.')
        ? slash(path.resolve(path.dirname(original || importer), source)) : slash(source);
      const relative = absolute.startsWith(input + '/') ? absolute.slice(input.length + 1) : '';
      if (sources.has(relative)) {
        const caller = slash(importer).slice(input.length + 1);
        const owner = roots.find(root => caller.startsWith(root + '/'));
        if (!owner) this.error(`分包共享工具被主包引用：${relative} <- ${caller}；请重新审查共享归属。`);
        const id = `${input}/${owner}/shared/${relative}`;
        copies.set(id, absolute);
        return id;
      }
      // Relative dependencies of a virtual copy still resolve from its source.
      // Nested scoped helpers take the branch above, preserving the same owner.
      if (original && source.startsWith('.')) {
        return this.resolve(absolute, original, { skipSelf: true });
      }
    },
    load(id) {
      const original = copies.get(id);
      if (!original) return;
      this.addWatchFile(original);
      return { code: readFileSync(original, 'utf8'), map: null };
    },
  };
}
