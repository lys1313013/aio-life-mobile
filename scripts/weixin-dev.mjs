import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { readWeixinBuildState, weixinSourceFingerprint, weixinStatePaths } from './weixin-build-state.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const destination = path.join(root, 'dist/dev/mp-weixin');
const { workspace, lockFile } = weixinStatePaths(root, destination);
const managerFile = path.join(workspace, 'dev-manager.json');
const logFile = path.join(workspace, 'dev.log');
const command = process.argv[2];
const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};
const read = file => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const stopFile = token => path.join(workspace, `stop-${token}`);
function environmentFingerprint() {
  return createHash('sha256').update(JSON.stringify(Object.entries(process.env)
    .filter(([key]) => key.startsWith('VITE_') || key === 'NODE_ENV')
    .sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
}
// Vite/uni can retain config and removed modules across incremental rounds.
// Rebuild on configuration or source-tree shape changes even if Rollup reports ready.
function restartFingerprint() {
  for (let attempt = 0; ; attempt++) {
    try { return readRestartFingerprint(); } catch (error) {
      if (error.code !== 'ENOENT' || attempt >= 2) throw error;
    }
  }
}
function readRestartFingerprint() {
  const hash = createHash('sha256');
  function visit(directory, contents) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.DS_Store' || entry.name === 'project.private.config.json') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file, contents);
      else if (entry.isFile()) {
        hash.update(path.relative(root, file));
        if (contents) hash.update(fs.readFileSync(file));
      }
    }
  }
  visit(path.join(root, 'scripts'), true);
  visit(path.join(root, 'src'), false);
  const files = ['package.json', 'package-lock.json', 'vite.config.js', 'src/pages.json',
    'src/manifest.json', 'src/project.config.json', 'src/styles/spacing.json', 'src/styles/typography.json',
    ...fs.readdirSync(root).filter(name => name === '.env' || name.startsWith('.env.'))];
  for (const file of files.sort()) {
    const full = path.join(root, file);
    hash.update(file);
    if (fs.existsSync(full)) hash.update(fs.readFileSync(full));
  }
  return hash.digest('hex');
}
const current = () => {
  const state = readWeixinBuildState(root, destination);
  const manager = read(managerFile);
  const configMatches = !alive(manager?.pid) || (manager.configurationFingerprint === restartFingerprint()
    && manager.environmentFingerprint === environmentFingerprint() && manager.childPid === state?.launcherPid);
  return { state, fresh: state?.status === 'ready' && alive(state.launcherPid)
    && alive(state.compilerPid) && state.sourceFingerprint === weixinSourceFingerprint(root)
    && configMatches
    && ['app.js', 'app.json', 'uvue.wxss', 'project.config.json'].every(file => fs.existsSync(path.join(destination, file))) };
};

async function supervise() {
  fs.mkdirSync(workspace, { recursive: true });
  const owner = { pid: process.pid, token: randomUUID(), startedAt: new Date().toISOString(),
    environmentFingerprint: environmentFingerprint() };
  try { fs.writeFileSync(managerFile, JSON.stringify(owner), { flag: 'wx' }); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (alive(read(managerFile)?.pid)) return;
    fs.unlinkSync(managerFile);
    // Another simultaneous starter may win this exclusive create; never overwrite it.
    fs.writeFileSync(managerFile, JSON.stringify(owner), { flag: 'wx' });
  }
  let child, childDone, stopping = false, sourceAtLaunch, lastSource, changedAt = 0;
  let configurationAtLaunch, configurationChangedAt = 0;
  let restartAttempts = 0;
  const stop = () => { stopping = true; };
  function saveOwner() {
    const temporary = managerFile + '.' + owner.token;
    fs.writeFileSync(temporary, JSON.stringify(owner));
    fs.renameSync(temporary, managerFile);
  }
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, stop);
  async function stopCompiler() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const stopped = await Promise.race([childDone.then(() => true), delay(15000, false, { ref: false })]);
    if (!stopped) throw new Error('编译器未响应停止请求；保留锁并停止管理器，请检查 dev.log。');
  }
  function launch() {
    for (const script of ['generate-spacing.cjs', 'generate-typography.cjs', 'generate-weixin-tab-bar.cjs']) {
      const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], { cwd: root, stdio: 'inherit' });
      if (result.error || result.status !== 0) throw new Error(`生成配置失败：${script}`);
    }
    sourceAtLaunch = weixinSourceFingerprint(root);
    configurationAtLaunch = restartFingerprint();
    owner.configurationFingerprint = configurationAtLaunch;
    owner.childPid = null;
    saveOwner();
    configurationChangedAt = 0;
    lastSource = sourceAtLaunch;
    changedAt = 0;
    console.log(`[weixin-dev] ${new Date().toISOString()} 启动开发监听`);
    // Fixed destination; a shell's release UNI_OUTPUT_DIR must not redirect this command.
    const env = { ...process.env, UNI_OUTPUT_DIR: destination };
    child = spawn(process.execPath, [path.join(root, 'scripts/run-weixin.mjs'), 'dev'], {
      cwd: root, env, stdio: ['ignore', 'inherit', 'inherit'],
    });
    owner.childPid = child.pid;
    saveOwner();
    childDone = new Promise(resolve => {
      child.once('error', error => { console.error(error.message); resolve(); });
      child.once('close', resolve);
    });
  }
  try {
    const existing = read(lockFile);
    if (alive(existing?.pid) || alive(existing?.compilerPid)) {
      throw new Error('已有前台微信监听，请先在原终端停止 npm run dev:weixin，再启动后台监听。');
    }
    launch();
    while (!stopping && !fs.existsSync(stopFile(owner.token))) {
      await delay(2000);
      const source = weixinSourceFingerprint(root);
      if (source !== lastSource) { lastSource = source; changedAt = Date.now(); restartAttempts = 0; }
      const state = readWeixinBuildState(root, destination);
      if (restartFingerprint() !== configurationAtLaunch && !configurationChangedAt) configurationChangedAt = Date.now();
      const ready = state?.launcherPid === child.pid && state.status === 'ready' && state.sourceFingerprint === source;
      if (ready) { sourceAtLaunch = source; changedAt = 0; }
      const exited = child.exitCode !== null || child.signalCode !== null;
      // Give normal incremental compilation time to finish. Config/env changes,
      // deleted modules and missed watch events get a complete fresh compilation.
      const stale = changedAt && Date.now() - changedAt >= 10000
        && (state?.status !== 'building' || Date.now() - Date.parse(state.buildStartedAt) > 300000);
      const crashed = exited && restartAttempts < 3;
      const configChanged = configurationChangedAt && Date.now() - configurationChangedAt >= 2000;
      const hung = state?.status === 'building' && Date.now() - Date.parse(state.buildStartedAt || state.startedAt) > 300000;
      if (stale || crashed || configChanged || hung) {
        if (restartAttempts >= 3 && source === sourceAtLaunch) continue;
        restartAttempts++;
        console.log(`[weixin-dev] ${configChanged ? '构建配置或文件结构变化' : hung ? '编译超时' : stale ? '源码未同步' : '监听意外退出'}，重新构建（${restartAttempts}/3）`);
        await stopCompiler();
        launch();
      }
    }
  } finally {
    await stopCompiler();
    if (read(managerFile)?.token === owner.token) fs.unlinkSync(managerFile);
    fs.rmSync(stopFile(owner.token), { force: true });
  }
}

async function start(open) {
  fs.mkdirSync(workspace, { recursive: true });
  let manager = read(managerFile);
  if (alive(manager?.pid) && manager.environmentFingerprint !== environmentFingerprint()) {
    throw new Error('运行中的监听使用不同的 VITE_* / NODE_ENV 环境；先运行 npm run weixin:stop，再用所需环境重新启动。');
  }
  if (!alive(manager?.pid)) {
    // Rotate on a new session; all logs stay in the ignored artifact directory.
    if (fs.existsSync(logFile)) fs.renameSync(logFile, logFile + '.previous');
    const log = fs.openSync(logFile, 'a', 0o600);
    const daemon = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run'], {
      cwd: root, env: process.env, detached: true, stdio: ['ignore', log, log],
    });
    await new Promise((resolve, reject) => { daemon.once('spawn', resolve); daemon.once('error', reject); });
    fs.closeSync(log);
    daemon.unref();
  }
  console.log(`等待当前源码编译完成… 日志：${logFile}`);
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    await delay(1000);
    manager = read(managerFile);
    if (alive(manager?.pid) && current().fresh) {
      console.log(`开发产物已与当前源码一致；后台监听运行中。\n项目：${destination}`);
      if (open) {
        const candidates = process.env.WECHAT_DEVTOOLS_CLI ? [process.env.WECHAT_DEVTOOLS_CLI] : [
          '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
          path.join(os.homedir(), 'Applications/wechatwebdevtools.app/Contents/MacOS/cli'),
        ];
        const cli = candidates.find(file => fs.existsSync(file));
        if (!cli) throw new Error('找不到微信开发者工具 CLI；请手动打开上面的开发目录，或设置 WECHAT_DEVTOOLS_CLI。');
        const result = spawnSync(cli, ['open', '--project', destination], { stdio: 'inherit', timeout: 60000 });
        if (result.error || result.status !== 0) throw new Error('开发产物已更新，但打开微信工具失败；检查 CLI 服务端口或手动打开开发目录。');
      }
      return;
    }
    if (!alive(manager?.pid)) throw new Error(`后台监听未启动，请查看 ${logFile}`);
    const state = readWeixinBuildState(root, destination);
    if (state?.status === 'error' && state.launcherPid === manager.childPid) {
      throw new Error(`编译失败，旧产物已保留；后台监听仍在，修复源码后会重试。日志：${logFile}`);
    }
  }
  throw new Error(`尚未确认产物与当前源码一致；后台仍运行，请查看 ${logFile}`);
}

async function main() {
  if (command === 'run') return supervise();
  if (command === 'start' || command === 'open') return start(command === 'open');
  if (command === 'stop') {
    const owner = read(managerFile);
    if (!alive(owner?.pid)) { console.log('后台监听未运行。'); return; }
    // Ask the owning process to stop, instead of signalling a potentially reused PID.
    fs.writeFileSync(stopFile(owner.token), 'stop\n');
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline && read(managerFile)?.token === owner.token) await delay(200);
    if (read(managerFile)?.token === owner.token) throw new Error(`监听未响应停止请求，请查看 ${logFile}`);
    console.log('后台监听已停止。');
    return;
  }
  if (command === 'status') {
    const { state, fresh } = current();
    console.log(`后台管理：${alive(read(managerFile)?.pid) ? '运行中' : '未运行'}\n开发编译：${state?.status || '未知'}\n与当前源码一致：${fresh ? '是' : '否'}\n最后同步：${state?.publishedAt || '未知'}\n项目：${destination}\n日志：${logFile}`);
    if (!fresh) process.exitCode = 1;
    return;
  }
  throw new Error('用法：npm run weixin:start | weixin:open | weixin:status | weixin:stop');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
