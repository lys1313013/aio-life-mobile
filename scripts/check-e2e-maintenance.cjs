const fs = require('node:fs');
const path = require('node:path');

// 这是历史债务的词法计数护栏，不代替语义审查；不提供自动扩大基线的命令。
const patterns = {
  fixedWait: /\.waitForTimeout\s*\(/g,
  networkIdle: /['"]networkidle['"]/g,
  forceClick: /\bforce\s*:\s*true\b/g,
};
function risks(source) {
  return Object.fromEntries(Object.entries(patterns).map(([key, pattern]) => [key, [...source.matchAll(pattern)].length]));
}
function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : /\.(?:c?js|ts)$/.test(file) ? [file] : [];
  });
}
function check(root) {
  const directory = path.join(root, 'tests/e2e');
  const budget = JSON.parse(fs.readFileSync(path.join(root, 'tests/e2e-maintenance-budget.json'), 'utf8'));
  const issues = [];
  const seen = new Set();
  for (const file of filesUnder(directory)) {
    const name = path.relative(directory, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    seen.add(name);
    if (name.endsWith('.spec.js')) {
      const shared = './' + path.relative(path.dirname(file), path.join(directory, 'support/test')).split(path.sep).join('/');
      if (!source.includes(`require('${shared}')`) || /require\(['"]@playwright\/test['"]\)/.test(source)) {
        issues.push(`${name}: 必须从 ${shared} 导入 test/expect，保证统一失败诊断生效`);
      }
    }
    for (const [kind, count] of Object.entries(risks(source))) {
      const allowed = budget[name]?.[kind] || 0;
      if (count > allowed) issues.push(`${name}: ${kind} 从 ${allowed} 增至 ${count}；改为状态断言/明确响应/受控时钟，不得扩大基线`);
      if (count < allowed) issues.push(`${name}: ${kind} 已降至 ${count}，请同步下调 e2e-maintenance-budget.json，避免回退`);
    }
  }
  for (const name of Object.keys(budget)) {
    if (!seen.has(name)) issues.push(`${name}: 文件已删除，请清理对应历史债务基线`);
  }
  return issues;
}
if (require.main === module) {
  const issues = check(path.resolve(__dirname, '..'));
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('E2E 维护检查通过：统一诊断入口齐全，历史脆弱写法未增加。');
}
module.exports = { risks, check, filesUnder };
