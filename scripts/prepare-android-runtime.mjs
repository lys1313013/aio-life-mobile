import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** HBuilderX 5.31 云包混入旧 C++ 库；使用完全相同核心版本的官方基座运行库。 */
export function prepareAndroidRuntime(stage) {
  const hx = process.env.AIO_HBUILDERX_ROOT || '/Applications/HBuilderX-Alpha.app/Contents/HBuilderX';
  const base = path.join(hx, 'plugins/uniappx-vapor-launcher/base/android_base.apk');
  if (!fs.existsSync(base)) throw new Error('请通过 AIO_HBUILDERX_ROOT 指向已安装 Vapor 基座的 HBuilderX 5.31');
  const read = name => execFileSync('unzip', ['-p', base, name], { maxBuffer: 64 * 1024 * 1024 });
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const core = read('lib/arm64-v8a/libuniappx.so');
  const runtime = read('lib/arm64-v8a/libc++_shared.so');
  if (hash(core) !== 'f2e9978aee85d0dd1eea0fcbedc216401e7a0871f304362d1b942cdb91a5d86f'
      || hash(runtime) !== 'c4c2fe5cbcb1fba0003a31fc7ab29a9bb12df6cc187ec45a806462540e83d93b') {
    throw new Error('HBuilderX 原生运行库版本已变化，请重新验证并更新兼容配置，不可沿用旧库');
  }
  // 仅在忽略的 App 工程里通过现有 UTS 插件 libs 机制送入云端。
  // 不修改安全随机数实现，也不把二进制加进 Web/微信或源码仓库。
  const target = path.join(stage, 'uni_modules/aio-secure-random/utssdk/app-android/libs/arm64-v8a');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'libc++_shared.so'), runtime);
  fs.writeFileSync(path.join(stage, '../runtime-provenance.json'), JSON.stringify({
    base, coreSha256: hash(core), runtimeSha256: hash(runtime),
  }, null, 2) + '\n');
}
