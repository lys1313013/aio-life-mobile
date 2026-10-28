import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { weixinSourceSnapshot, weixinSourceFingerprint, writeWeixinBuildState } from './weixin-build-state.mjs';

const privateConfig = 'project.private.config.json';

function filesIn(directory, prefix = '') {
  const files = new Map();
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [nested, value] of filesIn(file, name + '/')) files.set(nested, value);
    } else if (entry.isFile()) {
      files.set(name, file);
    } else {
      throw new Error(`不支持的微信产物：${name}`);
    }
  }
  return files;
}

// Validate the entire snapshot before touching the project watched by DevTools.
// In particular app.json must never become visible before its copied theme.
export function publishWeixinOutput(staging, destination) {
  const snapshot = new Map([...filesIn(staging)]
    .filter(([name]) => name !== privateConfig)
    .map(([name, file]) => [name, fs.readFileSync(file)]));
  for (const required of ['app.json', 'app.js', 'uvue.wxss', 'project.config.json']) {
    if (!snapshot.has(required)) throw new Error(`微信产物不完整：缺少 ${required}`);
  }
  const json = new Map();
  for (const [name, content] of snapshot) {
    if (name.endsWith('.json')) json.set(name, JSON.parse(content.toString()));
  }
  const app = json.get('app.json');
  if (app.themeLocation) {
    const theme = json.get(app.themeLocation);
    if (!theme?.light || !theme?.dark) throw new Error(`微信产物不完整：缺少有效的 ${app.themeLocation}`);
  }
  const pages = [...(app.pages || []), ...(app.subPackages || app.subpackages || [])
    .flatMap(pkg => (pkg.pages || []).map(page => `${pkg.root}/${page}`))];
  for (const page of pages) {
    for (const extension of ['js', 'json', 'wxml']) {
      if (!snapshot.has(`${page}.${extension}`)) throw new Error(`微信产物不完整：缺少 ${page}.${extension}`);
    }
  }
  for (const tab of app.tabBar?.list || []) {
    for (const icon of [tab.iconPath, tab.selectedIconPath].filter(Boolean)) {
      if (!snapshot.has(icon)) throw new Error(`微信产物不完整：缺少 ${icon}`);
    }
  }

  fs.mkdirSync(destination, { recursive: true });
  const previous = filesIn(destination);
  const changed = [...snapshot].filter(([name, content]) => !previous.has(name)
    || !fs.readFileSync(previous.get(name)).equals(content));
  // New dependencies first; app.js and the routing/configuration switch last.
  const priority = name => name === 'app.json' ? 3 : name === 'app.js' ? 2 : previous.has(name) ? 1 : 0;
  changed.sort(([a], [b]) => priority(a) - priority(b));
  // Temp files stay outside the project and rename replaces each file atomically.
  const temporary = fs.mkdtempSync(path.join(path.dirname(destination), '.weixin-publish-'));
  try {
    // Finish all temporary writes before replacing any published file, so disk
    // exhaustion while preparing the snapshot leaves the old project intact.
    for (const [index, [, content]] of changed.entries()) {
      fs.writeFileSync(path.join(temporary, String(index)), content);
    }
    for (const [index, [name]] of changed.entries()) {
      const target = path.join(destination, name);
      const temp = path.join(temporary, String(index));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(temp, target);
    }
    // Prune stale files only after the new configuration and dependencies exist.
    // DevTools owns its private settings; never reset them on rebuild.
    for (const [name, file] of previous) {
      if (name !== privateConfig && !snapshot.has(name)) fs.unlinkSync(file);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return changed.length;
}

// Watch directories rather than individual file inodes. Linux recursive fs.watch
// can lose a file watch when the compiler deletes and recreates the same path.
function watchOutputDirectories(root, onChange) {
  const watchers = new Map();
  function refresh() {
    const directories = new Map();
    function visit(directory) {
      try {
        const stat = fs.statSync(directory);
        if (!stat.isDirectory()) return;
        directories.set(directory, stat.ino);
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.isDirectory()) visit(path.join(directory, entry.name));
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    visit(root);
    for (const [directory, entry] of watchers) {
      if (directories.get(directory) !== entry.inode) {
        entry.watcher.close();
        watchers.delete(directory);
      }
    }
    for (const [directory, inode] of directories) {
      if (watchers.has(directory)) continue;
      const watcher = fs.watch(directory, event => {
        if (event === 'rename') refresh();
        onChange();
      });
      watchers.set(directory, { inode, watcher });
    }
  }
  refresh();
  return {
    refresh,
    close() {
      for (const { watcher } of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}

export function weixinOutput() {
  let root, mode, staging, destination, logger, watcher, timer;
  let buildingSnapshot, publishedSnapshot;
  let building = true, healthy = false;
  const cancel = () => { clearTimeout(timer); timer = undefined; };
  const close = () => { cancel(); watcher?.close(); };
  const publish = () => publishWeixinOutput(staging, destination);
  const record = patch => writeWeixinBuildState(root, destination, {
    mode, compilerPid: process.pid,
    ...(process.env.AIO_WEIXIN_LAUNCHER_PID ? { launcherPid: Number(process.env.AIO_WEIXIN_LAUNCHER_PID) } : {}),
    ...patch,
  });
  const ready = snapshot => {
    publishedSnapshot = snapshot;
    record({ status: 'ready', reason: null, publishedAt: new Date().toISOString(),
      sourceFingerprint: snapshot?.fingerprint || null, buildingFingerprint: null });
  };
  // Static copies can finish without a Rollup build. Advance the fingerprint
  // only when every source difference is a verified, directly copied resource.
  // An unrelated code/config edit must remain visibly stale until it is built.
  const staticSnapshotIsPublished = snapshot => {
    if (!publishedSnapshot) return false;
    const names = new Set([...Object.keys(publishedSnapshot.files), ...Object.keys(snapshot.files)]);
    for (const name of names) {
      if (publishedSnapshot.files[name] === snapshot.files[name]) continue;
      if (!name.startsWith('src/static/') && !name.startsWith('src/custom-tab-bar/')
        && name !== 'src/theme.json' && name !== 'src/project.config.json') return false;
      const output = path.join(staging, name.slice('src/'.length));
      if (!snapshot.files[name]) {
        if (fs.existsSync(output)) return false;
      } else if (!fs.existsSync(output)
        || createHash('sha256').update(fs.readFileSync(output)).digest('hex') !== snapshot.files[name]) return false;
    }
    return true;
  };
  return {
    name: 'aio-weixin-output',
    apply: () => {
      if (process.env.UNI_PLATFORM !== 'mp-weixin') return false;
      if (!process.env.AIO_WEIXIN_OUTPUT_DIR) {
        throw new Error('微信构建请使用 npm run dev:weixin 或 npm run build:weixin，避免编译器清空开发者工具正在读取的目录。');
      }
      return true;
    },
    configResolved(config) {
      staging = path.resolve(process.env.UNI_OUTPUT_DIR);
      destination = path.resolve(process.env.AIO_WEIXIN_OUTPUT_DIR);
      root = path.resolve(config.root || path.dirname(staging));
      mode = process.env.AIO_WEIXIN_MODE || (config.build.watch ? 'dev' : 'build');
      if (staging === destination || path.resolve(config.build.outDir) !== staging) {
        throw new Error('微信编译必须写入隔离目录，不能直接清空开发者工具项目。');
      }
      logger = config.logger;
      fs.mkdirSync(staging, { recursive: true });
      if (config.build.watch) {
        // Static copies bypass Rollup. Publish them after the compiler's copy
        // watcher finishes its synchronous writes, unless a bundle is in flight.
        watcher = watchOutputDirectories(staging, () => {
          cancel();
          timer = setTimeout(() => {
            if (building || !healthy) return;
            try {
              const snapshot = weixinSourceSnapshot(root);
              const canAdvance = staticSnapshotIsPublished(snapshot);
              const changed = publish();
              ready(canAdvance && weixinSourceFingerprint(root) === snapshot.fingerprint ? snapshot : publishedSnapshot);
              if (changed) console.log(`[weixin-output] 静态资源已同步（${changed} 个文件）`);
            } catch (error) {
              record({ status: 'error', reason: 'static-publish-failed' });
              logger.error(`[weixin-output] 静态资源未同步，保留上次产物：${error.message}`);
            }
          }, 150);
        });
      }
    },
    buildStart() {
      building = true;
      cancel();
      buildingSnapshot = weixinSourceSnapshot(root);
      record({ status: 'building', reason: null, buildStartedAt: new Date().toISOString(),
        buildingFingerprint: buildingSnapshot.fingerprint });
    },
    buildEnd(error) {
      if (error) {
        healthy = false;
        record({ status: 'error', reason: 'build-failed' });
      }
    },
    renderError() {
      healthy = false;
      record({ status: 'error', reason: 'render-failed' });
    },
    writeBundle: {
      order: 'post',
      // Rollup writeBundle hooks are parallel by default. Wait for uni:copy,
      // including theme.json, custom-tab-bar and static icons, before publishing.
      sequential: true,
      handler() {
        cancel();
        healthy = false;
        try {
          watcher?.refresh();
          const changed = publish();
          if (process.env.AIO_WEIXIN_RESULT_FILE) fs.writeFileSync(process.env.AIO_WEIXIN_RESULT_FILE, 'published\n');
          ready(buildingSnapshot);
          healthy = true;
          building = false;
          console.log(`[weixin-output] 已同步 ${changed} 个文件 → ${destination}`);
        } catch (error) {
          record({ status: 'error', reason: 'publish-failed' });
          throw error;
        }
      },
    },
    closeWatcher: close,
    closeBundle() {
      if (!this.meta.watchMode) close();
    },
  };
}
