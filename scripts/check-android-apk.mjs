import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import { androidModulePlan } from './android-native-modules.mjs';
import { assertAndroidStyles } from './check-android-styles.mjs';

const appAssets = /^assets\/apps\/[^/]+\/www\/app-service\.js$/;
const registry = 'io.dcloud.uts.generated.StaticUTSAutoRegister';

// DEX class_defs reference type_ids and string_ids. A reference alone is not a class definition.
function dexClasses(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'dex\n') throw new Error('APK 包含无效的 DEX 文件');
  const strings = bytes.readUInt32LE(60);
  const types = bytes.readUInt32LE(68);
  const count = bytes.readUInt32LE(96);
  const classes = bytes.readUInt32LE(100);
  return Array.from({ length: count }, (_, index) => {
    const type = bytes.readUInt32LE(classes + index * 32);
    const string = bytes.readUInt32LE(types + type * 4);
    let offset = bytes.readUInt32LE(strings + string * 4);
    while (bytes.readUInt8(offset++) & 0x80) { /* 跳过 ULEB128 长度 */ }
    const end = bytes.indexOf(0, offset);
    if (end === -1) throw new Error('DEX 类描述符无效');
    return bytes.toString('utf8', offset + 1, end - 1).replaceAll('/', '.');
  });
}

export async function sdkRegistrars(libraries, modules) {
  const registrars = new Map();
  for (const name of modules) {
    const archive = path.join(libraries, `${name}-release.aar`);
    const aar = await JSZip.loadAsync(await fs.readFile(archive).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`原生模块 ${name} 缺少 SDK 文件 ${archive}`);
      throw error;
    }));
    const jar = await JSZip.loadAsync(await aar.file('classes.jar').async('nodebuffer'));
    const markers = jar.file(/^META-INF\/uniappx\/auto-register\/[^/]+\.properties$/);
    const classes = [];
    for (const marker of markers) {
      const definition = (await marker.async('string')).match(/^registrarClass\s*=\s*([\w.$]+)\s*$/m);
      if (!definition) throw new Error(`无法读取 ${name} 的 UTS 注册类`);
      classes.push(definition[1]);
    }
    // SDK 的辅助 AAR 也必须随包交付。没有注册器时，使用该 AAR 自己定义的类作标识。
    if (!classes.length) {
      const [marker] = jar.file(/^[\w/]+\.class$/).filter(file => !/\/(BuildConfig|R)\.class$/.test(file.name));
      if (!marker) throw new Error(`无法确定 ${name} 在 APK 中的标识类`);
      classes.push(marker.name.slice(0, -6).replaceAll('/', '.'));
    }
    registrars.set(name, { classes, autoRegister: markers.length > 0 });
  }
  return registrars;
}

export async function checkAndroidApk(apk, { libraries, plugins = new Map() }) {
  const zip = await JSZip.loadAsync(await fs.readFile(apk));
  const services = zip.file(appAssets);
  if (services.length !== 1) throw new Error('APK 必须包含一份 App Vapor 业务资源');
  const service = services[0];
  const appManifest = zip.file(path.posix.join(path.posix.dirname(service.name), 'manifest.json'));
  if (!appManifest) throw new Error('APK 缺少 App Vapor manifest.json');
  const manifest = JSON.parse(await appManifest.async('string'));
  if (manifest['uni-app-x']?.vapor !== true) throw new Error('APK 业务资源未启用 Vapor');
  const code = await service.async('string');
  assertAndroidStyles(code);
  const modules = androidModulePlan(code, manifest);
  const registrars = await sdkRegistrars(libraries, modules);
  const dexFiles = zip.file(/^classes(?:\d+)?\.dex$/);
  if (!dexFiles.length) throw new Error('APK 缺少 DEX 文件');
  const definitions = new Set();
  for (const dex of dexFiles) {
    for (const name of dexClasses(await dex.async('nodebuffer'))) definitions.add(name);
  }
  const expected = new Map([...registrars, ['UTS 自动注册入口', { classes: [registry] }], ...plugins]);
  const missing = [...expected].flatMap(([name, { classes }]) => classes
    .filter(className => !definitions.has(className)).map(className => `${name} (${className})`));
  if (missing.length) throw new Error(`APK 缺少原生模块或注册类：\n  ${missing.join('\n  ')}`);
  execFileSync(process.execPath, [fileURLToPath(new URL('./check-android-runtime.mjs', import.meta.url)), apk], { stdio: 'inherit' });
  const pluginCount = plugins.size ? `、${plugins.size} 个项目 UTS 插件` : '';
  console.log(`APK 原生模块检查通过（${modules.length} 个 SDK 模块${pluginCount}）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [apk] = process.argv.slice(2);
  const sdk = process.env.AIO_ANDROID_VAPOR_SDK;
  if (!apk || !sdk) throw new Error('设置 AIO_ANDROID_VAPOR_SDK 后执行 npm run check:android-apk -- <APK 路径>');
  await checkAndroidApk(path.resolve(apk), {
    libraries: path.resolve(sdk, 'SDK/libs'),
  });
}
