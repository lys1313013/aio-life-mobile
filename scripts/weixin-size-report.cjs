const LIMIT_BYTES = 2048 * 1024;
const WARNING_BYTES = 1900 * 1024;

function normalizeFile(name) {
  const file = name.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!file || file.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`无效的编译产物路径：${name}`);
  }
  return file;
}

function checkSettings(config, privateConfig = {}) {
  const required = { minified: true, minifyWXSS: true, minifyWXML: true, uploadWithSourceMap: false };
  for (const [key, value] of Object.entries(required)) {
    if (config.setting?.[key] !== value) throw new Error(`发布配置 setting.${key} 必须为 ${value}`);
  }
  // DevTools may override compilation locally, while miniprogram-ci only reads project.config.json.
  const compileKeys = [...Object.keys(required), 'es6', 'es7', 'enhance', 'postcss', 'swc', 'minify', 'minifyJS', 'codeProtect', 'uglifyFileName', 'disableUseStrict', 'compileWorklet', 'ignoreUploadUnusedFiles'];
  for (const key of compileKeys) {
    if (Object.hasOwn(privateConfig.setting || {}, key) && privateConfig.setting[key] !== config.setting?.[key]) {
      throw new Error(`project.private.config.json 的 ${key} 覆盖了发布配置，请先统一再检查`);
    }
  }
  if (config.compileType !== 'miniprogram' || (config.miniprogramRoot && config.miniprogramRoot !== './')) {
    throw new Error('仅支持 uni 构建输出根目录中的 miniprogram 项目');
  }
}

function createReport(compiled, metadata = {}) {
  const mainBudgetBytes = metadata.mainBudgetBytes ?? LIMIT_BYTES;
  if (!Number.isInteger(mainBudgetBytes) || mainBudgetBytes <= 0 || mainBudgetBytes > LIMIT_BYTES) {
    throw new Error('主包工程预算必须是正整数且不能超过微信硬上限');
  }
  const files = new Map();
  for (const [name, content] of Object.entries(compiled)) {
    const file = normalizeFile(name);
    if (files.has(file)) throw new Error(`编译产物路径重复：${file}`);
    if (typeof content !== 'string' && !Buffer.isBuffer(content)) throw new Error(`无效的编译内容：${file}`);
    files.set(file, content);
  }
  if (!files.has('app.json')) throw new Error('微信编译结果缺少 app.json');
  const app = JSON.parse(files.get('app.json').toString());
  if (!Array.isArray(app.pages) || !app.pages.length) throw new Error('app.json 缺少主包页面');
  const declarations = app.subPackages ?? app.subpackages ?? [];
  if (!Array.isArray(declarations)) throw new Error('app.json 的 subPackages 必须为数组');
  if (app.plugins || declarations.some(pkg => pkg.plugins)) {
    throw new Error('当前离线检查不支持需账号属性的插件项目，不能跳过插件包体检查');
  }
  const roots = declarations.map(pkg => {
    if (typeof pkg.root !== 'string') throw new Error('分包缺少 root');
    const root = normalizeFile(pkg.root.replace(/\/+$/, ''));
    if (!Array.isArray(pkg.pages) || !pkg.pages.length) throw new Error(`分包 ${root} 缺少页面`);
    if (![...files.keys()].some(file => file.startsWith(root + '/'))) throw new Error(`分包 ${root} 缺少编译产物`);
    return root;
  });
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) {
    if (roots[i] === roots[j] || roots[i].startsWith(roots[j] + '/') || roots[j].startsWith(roots[i] + '/')) {
      throw new Error('分包 root 重复或互相嵌套');
    }
  }
  const packages = [{ name: '__APP__', root: '', files: [] }, ...roots.map(root => ({ name: root, root, files: [] }))];
  for (const [file, content] of files) {
    const pkg = packages.find(pkg => pkg.root && file.startsWith(pkg.root + '/')) || packages[0];
    pkg.files.push({ path: file, bytes: Buffer.byteLength(content) });
  }
  for (const pkg of packages) {
    pkg.files.sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
    pkg.bytes = pkg.files.reduce((sum, file) => sum + file.bytes, 0);
    pkg.limitBytes = LIMIT_BYTES;
    pkg.remainingBytes = LIMIT_BYTES - pkg.bytes;
    pkg.budgetBytes = pkg.root ? LIMIT_BYTES : mainBudgetBytes;
    pkg.budgetRemainingBytes = pkg.budgetBytes - pkg.bytes;
    pkg.status = pkg.bytes > pkg.budgetBytes ? 'error' : pkg.bytes > WARNING_BYTES ? 'warning' : 'ok';
  }
  return {
    schemaVersion: 1,
    ...metadata,
    measurement: 'miniprogram-ci compiled file bytes (not ZIP size; excludes server packaging overhead)',
    projectAttributes: 'offline defaults; no upload credentials or account-specific capabilities',
    limitBytes: LIMIT_BYTES,
    warningBytes: WARNING_BYTES,
    totalBytes: packages.reduce((sum, pkg) => sum + pkg.bytes, 0),
    status: packages.some(pkg => pkg.status === 'error') ? 'error' : packages.some(pkg => pkg.status === 'warning') ? 'warning' : 'ok',
    packages,
  };
}

function renderReport(report) {
  const kb = bytes => (bytes / 1024).toFixed(2);
  const lines = [`微信本地包体检查（miniprogram-ci ${report.compilerVersion || 'fixture'}）`, '口径：微信编译后的文件字节数，1 KB = 1024 字节；不是 ZIP 大小。'];
  for (const pkg of report.packages) {
    lines.push(`${pkg.status.toUpperCase().padEnd(7)} ${pkg.name === '__APP__' ? '主包' : pkg.name}: ${kb(pkg.bytes)} / ${kb(pkg.limitBytes)} KB，剩余 ${kb(pkg.remainingBytes)} KB`);
    if (pkg.budgetBytes && pkg.budgetBytes < pkg.limitBytes) {
      lines.push(`        工程预算 ${kb(pkg.budgetBytes)} KB，预算剩余 ${kb(pkg.budgetRemainingBytes)} KB`);
    }
  }
  lines.push(`全包合计：${kb(report.totalBytes)} KB`, '', '主包占用最大的 10 个文件：');
  for (const file of report.packages[0].files.slice(0, 10)) lines.push(`  ${kb(file.bytes).padStart(9)} KB  ${file.path}`);
  if (report.packages.some(pkg => pkg.bytes > pkg.limitBytes)) lines.push('\n失败：至少一个包超过 2048 KB，禁止进入上传步骤。');
  else if (report.status === 'error') lines.push('\n失败：主包超过工程预算，请拆分依赖后重新构建，不能以尚未达到微信硬上限为由放行。');
  else if (report.status === 'warning') lines.push('\n预警：包体超过 1900 KB，请预留增长空间；上传端仍会执行最终检查。');
  else lines.push('\n本地检查通过；不代表已上传、真机验证或正式发布。');
  return lines.join('\n');
}

module.exports = { LIMIT_BYTES, WARNING_BYTES, normalizeFile, checkSettings, createReport, renderReport };
