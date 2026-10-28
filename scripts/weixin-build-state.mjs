import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const hash = value => createHash('sha256').update(value).digest('hex');
const ignored = name => name === '.DS_Store' || name === 'project.private.config.json';

export function weixinStatePaths(root, destination) {
  const workspace = path.resolve(root, 'artifacts/weixin-output');
  const outputKey = hash(path.resolve(destination)).slice(0, 20);
  return {
    workspace, outputKey,
    stateFile: path.join(workspace, outputKey + '.state.json'),
    lockFile: path.join(workspace, outputKey + '.lock'),
  };
}

// Fingerprints contain file names and content hashes only. Never persist source,
// local AppIDs, .env values or credentials in the build-status document.
function sourceSnapshotOnce(root) {
  root = path.resolve(root);
  const entries = [];
  function visit(relative) {
    if (ignored(path.basename(relative))) return;
    const file = path.join(root, relative);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(relative + '/' + name);
    } else if (stat.isFile()) {
      entries.push([relative, hash(fs.readFileSync(file))]);
    } else {
      throw new Error(`微信源码指纹不支持特殊文件：${relative}`);
    }
  }
  for (const name of fs.readdirSync(root).sort()) {
    if (name === 'src' || name === 'scripts' || name === 'vite.config.js'
      || /^package.*\.json$/.test(name) || name.startsWith('.env')) visit(name);
  }
  entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const files = Object.fromEntries(entries);
  return { fingerprint: hash(JSON.stringify(entries)), files };
}

export function weixinSourceSnapshot(root) {
  // Editors commonly save by renaming a temporary file over the original.
  // Retry the whole tree so a disappearing file never yields a partial digest.
  for (let attempt = 0; ; attempt++) {
    try { return sourceSnapshotOnce(root); }
    catch (error) {
      if (error.code !== 'ENOENT' || attempt >= 3) throw error;
    }
  }
}

export function weixinSourceFingerprint(root) {
  return weixinSourceSnapshot(root).fingerprint;
}

export function readWeixinBuildState(root, destination) {
  const { stateFile } = weixinStatePaths(root, destination);
  let source;
  try { source = fs.readFileSync(stateFile, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  try {
    const state = JSON.parse(source);
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error();
    return state;
  } catch {
    throw Object.assign(new Error('微信构建状态损坏，请重新启动微信开发构建。'), { code: 'AIO_WEIXIN_STATE_CORRUPT' });
  }
}

export function writeWeixinBuildState(root, destination, patch) {
  const { workspace, stateFile } = weixinStatePaths(root, destination);
  fs.mkdirSync(workspace, { recursive: true });
  let previous;
  try { previous = readWeixinBuildState(root, destination); }
  catch (error) { if (error.code !== 'AIO_WEIXIN_STATE_CORRUPT') throw error; }
  const state = {
    status: 'stopped', mode: null, launcherPid: null, compilerPid: null,
    startedAt: null, publishedAt: null, sourceFingerprint: null,
    ...previous, ...patch,
    version: 1, destination: path.resolve(destination), updatedAt: new Date().toISOString(),
  };
  const temporary = stateFile + `.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(temporary, stateFile);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return state;
}
