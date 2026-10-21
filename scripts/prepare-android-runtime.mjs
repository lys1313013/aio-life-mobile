import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 5.32 官方本地基座的 C++ 符号检查通过，不再向 App 工程注入 5.31 云包补丁。
// 云端 APK 仍需单独执行 check-android-runtime.mjs，不能用本地基座代替验证。
export function prepareAndroidRuntime(stage) {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (pkg.dependencies['@dcloudio/uni-app'] !== '3.0.0-alpha-5030220261016001') {
    throw new Error('编译器版本已变化，请重新验证匹配版本的 HBuilderX Android 基座。');
  }
  const hx = process.env.AIO_HBUILDERX_ROOT || '/Applications/HBuilderX-Alpha.app/Contents/HBuilderX';
  const plugin = path.join(hx, 'plugins/uniappx-vapor-launcher');
  const base = path.join(plugin, 'base/android_base.apk');
  if (!fs.existsSync(base)) throw new Error('请安装 HBuilderX 5.32 Alpha 的 Vapor 基座，或使用 AIO_HBUILDERX_ROOT 指定安装目录。');
  const version = JSON.parse(fs.readFileSync(path.join(plugin, 'package.json'), 'utf8')).version;
  if (version !== '5.32.2026101614.0312') throw new Error('Vapor 基座版本已变化，请重新验证 Android 运行库兼容性。');
  const read = name => execFileSync('unzip', ['-p', base, name], { maxBuffer: 64 * 1024 * 1024 });
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const coreSha256 = hash(read('lib/arm64-v8a/libuniappx.so'));
  const runtimeSha256 = hash(read('lib/arm64-v8a/libc++_shared.so'));
  if (coreSha256 !== '1cdc9cc056893f104bbbbcab5f4df4965da2af9e50511b9358188e767f0cf75e'
      || runtimeSha256 !== 'c4c2fe5cbcb1fba0003a31fc7ab29a9bb12df6cc187ec45a806462540e83d93b') {
    throw new Error('官方基座原生库内容已变化，请重新验证，不可沿用旧运行库。');
  }
  execFileSync(process.execPath, [fileURLToPath(new URL('./check-android-runtime.mjs', import.meta.url)), base], { stdio: 'inherit' });
  // 只清理忽略工程中本脚本曾生成的覆盖库；不修改源码中的 UTS 插件。
  const target = path.join(stage, 'uni_modules/aio-secure-random/utssdk/app-android/libs/arm64-v8a/libc++_shared.so');
  fs.rmSync(target, { force: true });
  fs.writeFileSync(path.join(stage, '../runtime-provenance.json'), JSON.stringify({
    base, version, coreSha256, runtimeSha256,
    patchApplied: false, localBaseSymbolsPassed: true, cloudApkVerified: false,
  }, null, 2) + '\n');
}
