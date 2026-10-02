const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { checkSettings, createReport, renderReport } = require('./weixin-size-report.cjs');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} 缺少路径`);
  return path.resolve(args[index + 1]);
}
const sanitize = text => String(text || '').replace(/wx[0-9a-f]{16}/gi, '[AppID]');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

async function compile(projectPath, reportPath) {
  const config = readJson(path.join(projectPath, 'project.config.json'));
  const privatePath = path.join(projectPath, 'project.private.config.json');
  checkSettings(config, fs.existsSync(privatePath) ? readJson(privatePath) : {});
  const app = readJson(path.join(projectPath, 'app.json'));
  if (app.plugins || (app.subPackages || app.subpackages || []).some(pkg => pkg.plugins)) {
    throw new Error('当前离线检查不支持需账号属性的插件项目');
  }
  const ci = require('miniprogram-ci');
  const compilerVersion = require('miniprogram-ci/package.json').version;
  // The version is pinned because this offline attribute adapter uses a compiler internal.
  if (compilerVersion !== '2.1.31') throw new Error('升级 miniprogram-ci 后需重新验证离线编译适配');
  const { DefaultProjectAttr } = require('miniprogram-ci/dist/config/config');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-weixin-size-'));
  try {
    // Keep the build and DevTools state untouched. A deterministic offline project needs no real AppID.
    fs.cpSync(projectPath, temp, { recursive: true, filter: source => path.basename(source) !== 'project.private.config.json' });
    fs.writeFileSync(path.join(temp, 'project.config.json'), JSON.stringify({ ...config, appid: 'touristappid' }));
    const project = new ci.Project({
      appid: 'touristappid',
      type: 'miniProgram',
      projectPath: temp,
      // CIProject requires a non-empty value; it is deliberately not a credential.
      // attr avoids authenticated project lookup; only getCompiledResult is called.
      privateKey: 'LOCAL_COMPILE_ONLY_NOT_A_KEY',
      attr: async () => structuredClone(DefaultProjectAttr),
    });
    const compiled = await ci.getCompiledResult({ project, setting: { useProjectConfig: true }, threads: 2 });
    const report = createReport(compiled, { compilerVersion, generatedAt: new Date().toISOString(), settings: config.setting });
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    ci.cleanCache();
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function main() {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--worker') continue;
    if (args[i] !== '--project' && args[i] !== '--report') throw new Error(`不支持的参数：${args[i]}`);
    i++;
  }
  const projectPath = option('--project', path.join(root, 'dist/build/mp-weixin'));
  const reportPath = option('--report', path.join(root, 'artifacts/weixin-size/report.json'));
  if (reportPath === projectPath || reportPath.startsWith(projectPath + path.sep)) throw new Error('报告不能写入待检查的代码包');
  if (args.includes('--worker')) {
    await compile(projectPath, reportPath);
    return 0;
  }
  fs.rmSync(reportPath, { force: true });
  fs.rmSync(reportPath.replace(/\.json$/, '') + '.txt', { force: true });
  console.log('正在运行微信官方编译器进行本地包体检查（不会上传或更新体验版）…');
  // Node 25 enables an incomplete localStorage without a data file; the compiler assumes a browser API.
  // Pass the flag to its child processes as well. Node 22 in CI supports the same flag.
  const child = spawnSync(process.execPath, [__filename, '--worker', '--project', projectPath, '--report', reportPath], {
    cwd: root,
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --no-experimental-webstorage` },
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (child.error || child.status !== 0) {
    throw new Error(`微信编译失败，包体检查未通过。\n${sanitize(child.error?.message || child.stderr || child.stdout)}`);
  }
  const report = readJson(reportPath);
  const summary = renderReport(report);
  fs.writeFileSync(reportPath.replace(/\.json$/, '') + '.txt', summary + '\n');
  console.log(summary);
  console.log(`\n完整文件清单：${path.relative(root, reportPath)}`);
  return report.status === 'error' ? 1 : 0;
}

main().then(code => process.exit(code)).catch(error => {
  console.error(sanitize(error.message));
  process.exit(1);
});
