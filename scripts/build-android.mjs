import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { androidModulePlan, hostArchives } from './android-native-modules.mjs';
import { checkAndroidApk, sdkRegistrars } from './check-android-apk.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'src');
const output = path.join(root, 'artifacts/android');
const stage = path.join(output, 'AIO-Life-App');
const dist = path.join(stage, 'unpackage/dist/dev/app-android');
const host = path.join(output, 'local-gradle');
const templates = path.join(root, 'scripts/android');
const destination = path.join(output, 'AIO-Life-local-debug-arm64.apk');
const lock = path.join(output, '.build-android.lock');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function runLogged(command, args, log, options = {}) {
  const file = path.join(output, log);
  const fd = fs.openSync(file, 'w');
  try {
    execFileSync(command, args, { ...options, stdio: ['ignore', fd, fd] });
  } catch (error) {
    throw new Error(`命令执行失败，日志见 ${file}`, { cause: error });
  } finally {
    fs.closeSync(fd);
  }
}

async function prepareLocalIcons() {
  const jar = 'androidsvg-1.4.jar';
  const cache = path.join(output, 'maven-cache', jar);
  if (!fs.existsSync(cache)) {
    const response = await fetch('https://repo.maven.apache.org/maven2/com/caverock/androidsvg/1.4/' + jar, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`下载 ${jar} 失败，HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, data);
  }
  const sha256 = createHash('sha256').update(fs.readFileSync(cache)).digest('hex');
  if (sha256 !== '729c67ef475f19f112d01e4fc8e55b1f23841912f8e5090db27992801a04f79d') {
    fs.rmSync(cache);
    throw new Error(`${jar} 校验失败，请重新执行打包`);
  }
  // HBuilderX 的本地运行编译器需要 JAR，Gradle 从源码 config.json 读取 Maven 依赖。
  const iconPlugin = path.join(stage, 'uni_modules/aio-native-icons/utssdk/app-android');
  const configPath = path.join(iconPlugin, 'config.json');
  const config = readJson(configPath);
  config.dependencies = config.dependencies.filter(dependency => dependency !== 'com.caverock:androidsvg:1.4');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  copy(cache, path.join(iconPlugin, 'libs', jar));
}

async function build() {
  const vaporSdk = process.env.AIO_ANDROID_VAPOR_SDK;
  if (!vaporSdk) throw new Error('请将 AIO_ANDROID_VAPOR_SDK 指向解压的 DCloud Android Vapor 5.32 离线 SDK');
  const libraries = path.resolve(vaporSdk, 'SDK/libs');
  const sdkProject = path.resolve(vaporSdk, 'xvnativeproject');
  const androidSdk = path.resolve(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'Library/Android/sdk'));
  const hxRoot = process.env.AIO_HBUILDERX_ROOT || '/Applications/HBuilderX-Alpha.app/Contents/HBuilderX';
  const cli = path.resolve(hxRoot, '../MacOS/cli');
  const apksigner = path.join(androidSdk, 'build-tools/36.0.0/apksigner');
  for (const file of [cli, apksigner, path.join(androidSdk, 'platforms/android-36/android.jar'),
    path.join(sdkProject, 'build.gradle'), path.resolve(vaporSdk, 'plugins/auto-register-gradle-plugin-1.0.0.jar'),
    ...hostArchives.map(name => path.join(libraries, name + '-release.aar'))]) {
    if (!fs.existsSync(file)) throw new Error(`缺少 Android 打包工具或 SDK 文件：${file}`);
  }
  fs.rmSync(destination, { force: true });
  execFileSync(process.execPath, [path.join(root, 'scripts/prepare-app.mjs')], { stdio: 'inherit' });
  const stageManifest = readJson(path.join(stage, 'manifest.json'));
  if (!/^__UNI__[\w]+$/.test(stageManifest.appid)) {
    throw new Error('请用 AIO_DCLOUD_APP_ID 或忽略工程的 manifest 配置本地 DCloud AppID');
  }
  const envFile = path.join(stage, '.env.local');
  if (!/^VITE_API_BASE_URL=\S/m.test(fs.readFileSync(envFile, 'utf8'))) {
    fs.appendFileSync(envFile, '\nVITE_API_BASE_URL=https://aiolife.top/api\n');
  }
  await prepareLocalIcons();
  fs.rmSync(dist, { recursive: true, force: true });
  execFileSync(cli, ['open', '--path', stage], { stdio: 'inherit' });
  console.log('正在编译 Android Vapor 业务资源');
  runLogged(cli, ['launch', 'app-android', '--project', stage, '--compile', 'true', '--cleanCache', 'true'], 'local-vapor-compile.log');
  if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
    throw new Error('HBuilderX 未生成 Android 编译产物，详见 artifacts/android/local-vapor-compile.log');
  }
  const manifest = readJson(path.join(dist, 'manifest.json'));
  if (manifest.id !== stageManifest.appid || manifest['uni-app-x']?.vapor !== true
      || manifest['uni-app-x']?.compilerVersion !== '5.32') {
    throw new Error('Android 编译产物的 AppID 或 Vapor 编译器版本不匹配');
  }
  const service = fs.readFileSync(path.join(dist, 'app-service.js'), 'utf8');
  const modules = androidModulePlan(service, manifest);
  const registrars = await sdkRegistrars(libraries, modules);
  const app = path.join(host, 'app');
  const main = path.join(app, 'src/main');
  fs.rmSync(main, { recursive: true, force: true });
  fs.mkdirSync(main, { recursive: true });
  for (const file of ['build.gradle', 'gradle/libs.versions.toml', 'gradlew',
    'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties']) {
    copy(path.join(sdkProject, file), path.join(host, file));
  }
  // DCloud 的顶层脚本从 Gradle 工程的上一级读取插件。
  const buildFile = path.join(host, 'build.gradle');
  const pluginDirectory = path.resolve(vaporSdk, 'plugins').replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  const top = fs.readFileSync(buildFile, 'utf8').replaceAll('../plugins/', () => pluginDirectory + '/');
  fs.writeFileSync(buildFile, top);
  copy(path.join(templates, 'host-settings.gradle'), path.join(host, 'settings.gradle'));
  copy(path.join(templates, 'host-app.gradle'), path.join(app, 'build.gradle'));
  copy(path.join(templates, 'AndroidManifest.xml'), path.join(main, 'AndroidManifest.xml'));
  for (const density of ['hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    copy(path.join(stage, 'app-resources/icons/android', density + '.png'), path.join(main, 'res', 'mipmap-' + density, 'aio_life.png'));
  }
  fs.cpSync(dist, path.join(main, 'assets/apps', manifest.id, 'www'), {
    recursive: true,
    filter: file => path.relative(dist, file).split(path.sep)[0] !== 'uni_modules',
  });

  const plugins = new Map();
  const dependencies = new Set();
  const utsSources = path.join(source, 'uni_modules');
  for (const name of fs.readdirSync(utsSources)) {
    const android = path.join(utsSources, name, 'utssdk/app-android');
    if (!fs.existsSync(path.join(android, 'index.uts'))) continue;
    const kotlin = path.join(dist, 'uni_modules', name, 'utssdk/app-android/index.kt');
    if (!fs.existsSync(kotlin)) throw new Error(`编译没有生成项目 UTS 插件 ${name}`);
    const code = fs.readFileSync(kotlin, 'utf8');
    const packageName = code.match(/^package (uts\.sdk\.modules\.[\w.]+)\s*$/m)?.[1];
    if (!packageName || !code.includes('class UniUTSMethodRegister')) throw new Error(`未找到 ${name} 的 UTS 注册入口`);
    copy(kotlin, path.join(main, 'java', ...packageName.split('.'), 'index.kt'));
    plugins.set(name, { classes: [packageName + '.UniUTSMethodRegister'], packageName });
    const config = path.join(android, 'config.json');
    if (fs.existsSync(config)) {
      for (const dependency of readJson(config).dependencies ?? []) dependencies.add(dependency);
    }
  }
  fs.writeFileSync(path.join(app, 'app-build.json'), JSON.stringify({
    id: manifest.id,
    version: manifest.version,
    archives: [...new Set([...hostArchives, ...modules])].map(name => path.join(libraries, name + '-release.aar')),
    sdkRegistrars: [...registrars.values()].filter(entry => entry.autoRegister).flatMap(entry => entry.classes),
    pluginPackages: [...plugins.values()].map(plugin => plugin.packageName),
    dependencies: [...dependencies],
    debugKeystore: process.env.AIO_ANDROID_DEBUG_KEYSTORE && path.resolve(process.env.AIO_ANDROID_DEBUG_KEYSTORE),
  }, null, 2) + '\n');

  const gradle = process.env.AIO_ANDROID_GRADLE || path.join(host, 'gradlew');
  fs.chmodSync(path.join(host, 'gradlew'), 0o755);
  const args = process.argv.includes('--offline') ? ['--offline'] : [];
  console.log(`正在打包 Android APK（${modules.length} 个 SDK 模块、${plugins.size} 个项目 UTS 插件）`);
  runLogged(gradle, [...args, '--no-configuration-cache', ':app:assembleDebug'], 'local-gradle-build.log', {
    cwd: host,
    env: { ...process.env, AIO_ANDROID_VAPOR_SDK: path.resolve(vaporSdk), ANDROID_HOME: androidSdk, ANDROID_SDK_ROOT: androidSdk },
  });
  const apk = path.join(app, 'build/outputs/apk/debug/app-debug.apk');
  await checkAndroidApk(apk, { libraries, plugins });
  runLogged(apksigner, ['verify', apk], 'local-apk-signature.log');
  fs.copyFileSync(apk, destination);
  console.log(`Android 调试 APK 已通过校验：${destination}`);
}

fs.mkdirSync(output, { recursive: true });
try {
  fs.mkdirSync(lock);
} catch (error) {
  if (error.code === 'EEXIST') throw new Error(`Android 打包目录被占用：${lock}`);
  throw error;
}
try {
  await build();
} finally {
  fs.rmdirSync(lock);
}
