import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const root = fileURLToPath(new URL('..', import.meta.url));
const [mode, ...args] = process.argv.slice(2);
if (!['dev', 'build'].includes(mode)) throw new Error('用法：node scripts/run-weixin.mjs dev|build');
// Respect uni's environment/CLI output directory precedence, but never hand the
// published directory to uni: buildOptions empties it before compilation starts.
let output;
const forwarded = [];
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--outDir') {
    output = args[++index];
    if (!output || output.startsWith('--')) throw new Error('--outDir 缺少路径');
  } else if (args[index].startsWith('--outDir=')) {
    output = args[index].slice('--outDir='.length);
    if (!output) throw new Error('--outDir 缺少路径');
  } else forwarded.push(args[index]);
}
const destination = path.resolve(root, process.env.UNI_OUTPUT_DIR || output || `dist/${mode}/mp-weixin`);
const workspace = path.join(root, 'artifacts/weixin-output');
fs.mkdirSync(workspace, { recursive: true });
const outputKey = createHash('sha256').update(destination).digest('hex').slice(0, 20);
const lock = path.join(workspace, outputKey + '.lock');
const running = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
};
// Store the compiler PID too: killing the launcher alone must not allow a
// second compiler to publish while the first compiler is still alive.
try {
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  let owner;
  try { owner = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch { /* fail closed */ }
  if (!owner || running(owner.pid) || running(owner.compilerPid)) {
    throw new Error(`已有微信编译进程使用 ${destination}；请停止该进程后重试。`);
  }
  if (owner.directory && path.dirname(owner.directory) === workspace && /^(dev|build)-/.test(path.basename(owner.directory))) {
    fs.rmSync(owner.directory, { recursive: true, force: true });
  }
  fs.unlinkSync(lock);
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' });
}
// uni also writes sibling .tsc/.uvue/source-map directories. Keep them inside
// this invocation's disposable directory, and reuse one cache per output.
const directory = fs.mkdtempSync(path.join(workspace, mode + '-'));
const staging = path.join(directory, 'mp-weixin');
const resultFile = path.join(directory, 'published');
let compiler;
try {
  compiler = spawn(process.execPath, [
    path.join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),
    ...(mode === 'build' ? ['build'] : []), '-p', 'mp-weixin', ...forwarded,
  ], {
    cwd: root,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, UNI_OUTPUT_DIR: staging,
      UNI_APP_X_CACHE_DIR: process.env.UNI_APP_X_CACHE_DIR || path.join(workspace, 'cache', outputKey),
      AIO_WEIXIN_OUTPUT_DIR: destination, AIO_WEIXIN_RESULT_FILE: resultFile },
  });
  // uni prints its internal output path in the DevTools import instructions.
  // Keep those instructions pointed at the stable project, including when a
  // line or a multi-byte character arrives in separate child-process chunks.
  for (const [input, output] of [[compiler.stdout, process.stdout], [compiler.stderr, process.stderr]]) {
    createInterface({ input, crlfDelay: Infinity }).on('line', line => output.write(line
      .replaceAll(staging, destination)
      .replaceAll(path.relative(root, staging), path.relative(root, destination)) + '\n'));
  }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, compilerPid: compiler.pid, directory }));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => compiler.kill(signal));
  process.exitCode = await new Promise((resolve, reject) => {
    compiler.once('error', reject);
    compiler.once('close', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 143)));
  });
  if (process.exitCode === 0 && !fs.existsSync(resultFile)) {
    throw new Error('微信编译未完成产物同步，已停止；不能使用上次产物继续包体检查或上传。');
  }
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.unlinkSync(lock);
}
