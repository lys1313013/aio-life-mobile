const { spawnSync } = require('node:child_process');
const { accessSync, constants, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs } = require('node:util');

const root = path.resolve(__dirname, '..');
const version = '0.9.0';

function findCli() {
  const candidates = process.env.WECHAT_DEVTOOLS_CLI
    ? [path.resolve(process.env.WECHAT_DEVTOOLS_CLI)]
    : [
        '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
        path.join(os.homedir(), 'Applications/wechatwebdevtools.app/Contents/MacOS/cli'),
      ];
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next installation location.
    }
  }
  throw new Error('找不到微信开发者工具 CLI，请安装工具或用 WECHAT_DEVTOOLS_CLI 指定 CLI 的完整路径。');
}

function readAppId(projectPath) {
  const file = path.join(projectPath, 'project.config.json');
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`无法读取 ${path.relative(root, file)}，请先配置本地小程序项目。`);
  }
  if (!/^wx[0-9a-f]{16}$/i.test(config.appid || '')) {
    throw new Error(`${path.relative(root, file)} 缺少有效 AppID，请在本地配置中填写，勿提交真实 AppID。`);
  }
  return config.appid;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    console.error(`${label}失败，流程已停止。`);
    if (result.error) console.error(result.error.message);
    if (result.signal) console.error(`终止信号：${result.signal}`);
    process.exit(result.status || 1);
  }
}

function upload(cli, projectPath, desc) {
  // CLI 可能在上传失败后仍退出 0。官方仅在服务端确认成功后写入 info-output。
  // 每次使用全新目录，不能把上次上传的回执误当作本次成功。
  const directory = mkdtempSync(path.join(os.tmpdir(), 'aio-weixin-upload-'));
  const receiptPath = path.join(directory, 'info.json');
  try {
    const result = spawnSync(cli, ['upload', '--project', projectPath, '--version', version,
      '--desc', desc, '--info-output', receiptPath], { cwd: root, env: process.env, stdio: 'inherit' });
    if (result.error || result.signal || result.status !== 0) {
      throw new Error(`微信 CLI 上传失败，流程已停止。${result.error ? ` ${result.error.message}` : ''}`);
    }
    let receipt;
    try {
      receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    } catch {
      throw new Error('微信 CLI 未返回本次上传成功回执；即使退出码为 0，也不能判定上传成功。请查看上方微信错误信息。');
    }
    if (!Number.isSafeInteger(receipt?.size?.total) || receipt.size.total <= 0) {
      throw new Error('微信 CLI 上传回执无效，无法确认上传成功。');
    }
    console.log(`微信 CLI 上传成功，版本 ${version}，服务端回执包体 ${(receipt.size.total / 1024).toFixed(1)} KB；体验版状态请在公众平台确认，审核和正式发布需另行操作。`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      desc: { type: 'string', short: 'd', default: '功能更新' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('用法：npm run upload:weixin [-- --desc "更新说明"] 或 pnpm run upload:weixin [--desc "更新说明"]\n固定版本：0.9.0；默认说明：功能更新。\n执行构建、包体检查和上传；需登录微信开发者工具并开启「设置 → 安全设置 → 服务端口」。');
    return;
  }
  if (!values.desc.trim()) throw new Error('更新说明不能为空。');
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('请使用 npm run upload:weixin 或 pnpm run upload:weixin 执行。');
  const cli = findCli();
  const appid = readAppId(path.join(root, 'src'));

  console.log('[1/2] 构建微信小程序并检查包体…');
  // npm_execpath 指向本次调用使用的包管理器；两者的参数与 pre/post 开关不同。
  // 显式启用钩子，保证生成配置和官方包体检查都不能被用户配置跳过。
  const pnpm = /^pnpm\//.test(process.env.npm_config_user_agent || '')
    || /(?:^|[/\\])pnpm(?:\.[cm]?js|\.exe)?$/i.test(npmCli);
  const lifecycleOptions = pnpm
    ? ['--config.ignore-scripts=false', '--config.enable-pre-post-scripts=true']
    : ['--ignore-scripts=false'];
  run(process.execPath, [npmCli, ...lifecycleOptions, 'run', 'build:weixin'], '构建或包体检查');

  const projectPath = path.join(root, 'dist/build/mp-weixin');
  if (readAppId(projectPath) !== appid) throw new Error('构建产物 AppID 与本地配置不一致，已停止上传。');
  console.log(`[2/2] 上传微信小程序，版本 ${version}，说明：${values.desc}`);
  console.log('请确保微信开发者工具已登录并开启服务端口；连接失败时检查「设置 → 安全设置」。');
  // 显式打开发布项目，让 upload 使用已打开的项目进程。
  // 避免 CLI 隐藏后台初始化失败后持续复用已拒绝的 Promise。
  run(cli, ['open', '--project', projectPath], '打开微信发布项目');
  upload(cli, projectPath, values.desc);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
