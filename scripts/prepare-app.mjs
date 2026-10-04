import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareAndroidRuntime } from './prepare-android-runtime.mjs';
import { prepareNativeButtons } from './prepare-native-buttons.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = path.join(root, 'artifacts/android/AIO-Life-App');
const manifestPath = path.join(stage, 'manifest.json');
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
manifest.appid = process.env.AIO_DCLOUD_APP_ID || previous.appid || '';
fs.mkdirSync(stage, { recursive: true });
// Rebuild the source snapshot without deleting the local signing/build settings.
for (const entry of fs.readdirSync(path.join(root, 'src'))) {
  if (['manifest.json', 'project.config.json', 'project.private.config.json', '.hbuilderx', 'unpackage'].includes(entry)) continue;
  const destination = path.join(stage, entry);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'src', entry), destination, { recursive: true });
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
prepareAndroidRuntime(stage);
prepareNativeButtons(stage);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ ...pkg, scripts: {} }, null, 2) + '\n');
// pages/profile/about imports ../../../package.json in the original src layout.
fs.writeFileSync(path.join(stage, '../package.json'), JSON.stringify(pkg, null, 2) + '\n');
const modules = path.join(stage, 'node_modules');
if (!fs.existsSync(modules)) fs.symlinkSync(path.join(root, 'node_modules'), modules, 'dir');
const envFile = path.join(root, '.env.local');
const publicEnv = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
  .filter(line => /^VITE_(?:API_BASE_URL|WEB_API_BASE_URL)=/.test(line)).join('\n') : '';
fs.writeFileSync(path.join(stage, '.env.local'), publicEnv + '\n');
fs.writeFileSync(path.join(stage, 'vite.config.js'), `import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { appVendors } from '../../../scripts/app-vendors.mjs';
export default defineConfig({
  plugins: [appVendors(), uni()],
  define: { 'import.meta.env.VITE_APP_BUILD_TIME': JSON.stringify(new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')) },
});
`);
console.log(`HBuilderX App 工程已准备：${stage}`);
if (!manifest.appid) console.log('首次打包请在该工程 manifest.json 的 HBuilderX 可视化界面获取 DCloud AppID。');
