import path from 'node:path';

export function synchronousImports(code, file) {
  return [...code.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match =>
    match[1].startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]))
      : match[1].replace(/^\//, ''));
}

// Components are registered by their JSON, not necessarily a JS require.
// Treat emitted main-package components as runtime entries too, so their
// dependencies (icons, attachment handling, etc.) are not mistaken for dead JS.
export function unusedMainScripts(output, config) {
  const roots = (config.subPackages || config.subpackages || []).map(pkg => pkg.root.replace(/\/$/, '') + '/');
  const inMain = file => !roots.some(root => file.startsWith(root));
  const entries = ['app.js', ...(config.pages || []).map(page => page + '.js')];
  const graph = new Map();
  for (const file of Object.values(output)) {
    if (!file.fileName.endsWith('.js')) continue;
    const code = file.type === 'chunk' ? file.code : String(file.source);
    graph.set(file.fileName, synchronousImports(code, file.fileName));
  }
  for (const file of Object.values(output)) {
    if (!file.fileName.endsWith('.json')) continue;
    const json = JSON.parse(String(file.source));
    const script = file.fileName.replace(/\.json$/, '.js');
    if (json.component && inMain(script)) entries.push(script);
    for (const component of Object.values(json.usingComponents || {})) {
      if (/^[a-z]+:\/\//i.test(component)) continue;
      const target = component.startsWith('.')
        ? path.posix.join(path.posix.dirname(script), component)
        : component.replace(/^\//, '');
      const dependencies = graph.get(script) || [];
      dependencies.push(target + '.js');
      graph.set(script, dependencies);
    }
  }
  if (config.tabBar?.custom) entries.push('custom-tab-bar/index.js');
  const visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const dependency of graph.get(file) || []) visit(dependency);
  }
  entries.forEach(visit);
  return [...graph.keys()].filter(file => inMain(file) && !visited.has(file)).sort();
}
