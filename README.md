# AIO Life Mobile

AIO Life 的跨端客户端，采用 **uni-app x + Vapor**，连接 [aio-life-server](https://github.com/lys1313013/aio-life-server)。以首页、时迹、全部、我四栏组织生活记录、任务目标、财务物品和账号设置；完整功能与接口见[功能说明](docs/功能与接口.md)。本项目使用独立 Git 仓库，工作区入口为 [aio-life](https://github.com/lys1313013/aio-life)。

## 环境与平台

| 用途 | 要求 |
| --- | --- |
| 通用开发 | Node.js **20.19+**、npm；CI 使用 Node 22，以 `package-lock.json` 锁定依赖 |
| H5 | 浏览器、可访问的 AIO Life 后端；本地 E2E 使用已安装的 Google Chrome |
| 微信小程序 | 微信开发者工具；本地 AppID 配置见下文 |
| Android / iOS App | 与 npm 编译器匹配的 **HBuilderX 5.32 Alpha**；签名、SDK 与原生模块要求见 [App 开发与验证](docs/App开发与验证.md) |

DCloud 编译相关 npm 包统一固定为 `3.0.0-alpha-5030220261016001`，不要单独升级其中一个包。保留 `src/manifest.json` 的 `uni-app-x.vapor: true`。H5、微信编译与 App Vapor 真机验证各有边界，构建成功不代表所有平台功能已验收。

## 快速启动 H5

以下命令在本仓库根目录执行，首次获取代码后进入 `aio-life-mobile`：

```bash
npm ci
# 仅首次创建；已有 .env.local 时保留原配置
test -f .env.local || cp .env.example .env.local
npm run dev
```

访问 `http://127.0.0.1:5180`。先启动后端并完成其数据库与账号配置，再使用 AIO Life 账号登录；默认通过开发代理连接 `http://127.0.0.1:45678/api`，仓库不提供测试账号、密码或 Token。

### 接口配置

复制后的 `.env.local` 被 Git 忽略，变量示例见 [.env.example](.env.example)。修改环境配置后重新启动开发服务或重新构建。

| 变量 | 作用与默认值 |
| --- | --- |
| `AIO_API_PROXY_TARGET` | H5 开发代理目标，默认 `http://127.0.0.1:45678`，不含 `/api` |
| `VITE_WEB_API_BASE_URL` | H5 API 地址，默认同源 `/api` |
| `VITE_API_BASE_URL` | 微信 / App API 完整地址，以 `/api` 结尾；开发默认 `http://127.0.0.1:45678/api`，生产构建默认 `https://aiolife.top/api` |

手机联调时将 `VITE_API_BASE_URL` 设为手机可访问的后端地址；电脑局域网地址可用于本地调试，手机上的 `localhost` 指向手机自身。部署到其他环境时显式配置目标 API，避免沿用生产默认地址或本地调试地址。`VITE_*` 会进入客户端包，只能存放公开配置。

H5 生产部署需要为 `/api` 配置同源反向代理，或为自定义 API 地址配置正确的 CORS；LeetCode 页面使用的 `/leetcode-api` 也需要生产代理，开发代理规则见 [vite.config.js](vite.config.js)。微信生产环境使用 HTTPS 并配置服务器合法域名。

## 微信小程序

首次配置本地 AppID：

```bash
# 仅首次创建；已有 src/project.config.json 时保留原配置
test -f src/project.config.json || cp project.config.example.json src/project.config.json
# 在 src/project.config.json 中填写自己的 appid
npm run weixin:open
```

`src/project.config.json` 已被 Git 忽略，编译时复制到产物目录；源码 `manifest.json` 与示例配置中的 AppID 保持空值。自动打开需要可用的微信开发者工具 CLI 和服务端口，自定义安装位置用 `WECHAT_DEVTOOLS_CLI` 指定；也可手动打开编译后的稳定目录。

| 场景 | 命令 | 产物 / 行为 |
| --- | --- | --- |
| 日常开发 | `npm run weixin:open` | 启动或复用后台监听，确认源码同步后打开 `dist/dev/mp-weixin` |
| 仅启动监听 | `npm run weixin:start` | 等待当前源码同步，不打开工具 |
| 检查 / 停止监听 | `npm run weixin:status` / `npm run weixin:stop` | 检查进程与源码指纹，未同步时退出非零；停止本仓库后台监听 |
| 前台诊断 | `npm run dev:weixin` | 持续编译到 `dist/dev/mp-weixin`，需保持终端运行 |
| 发布构建 | `npm run build:weixin` | 生成 `dist/build/mp-weixin`，自动执行官方编译口径的包体检查 |
| 上传开发版本 | `npm run upload:weixin -- --desc "更新说明"` | 重新构建、检查包体并上传；需登录开发者工具并开启服务端口 |

后台监听在关闭终端后继续运行，重启电脑后需重新执行 `weixin:open`；前台与后台监听不能同时占用开发目录。微信编译入口先在隔离目录完成编译和资源复制，再同步稳定目录，失败保留上次产物。不要直接调用 `uni -p mp-weixin` 或将 `artifacts/weixin-output/` 内部目录导入开发者工具。

主包工程预算为 **1800 KB**，每包硬上限 **2048 KB**，依赖归属与预算以 [weixin-package-policy.json](scripts/weixin-package-policy.json) 为准。排查先看 `artifacts/weixin-size/`，最终包体以微信上传校验为准。上传只生成开发版本，体验版、审核、正式发布及真机验证分别确认。

监听日志、配置变更、不更新时的排查见[微信构建与包体](docs/微信小程序构建与包体.md)；首次发布、域名、隐私和后端微信登录准备见[微信部署说明](docs/微信小程序部署说明.md)。

微信运行时通过 `uni.getUpdateManager()` 监听新版下载完成，提示“清理更新”，确认后清理本机数据再调用 `applyUpdate()` 重启。若微信已自动启动新包，则按包内构建时间提示“清理重进”；首次安装不提示，完成清理后的同一构建不重复提示。取消或下载失败不清理数据；清理失败不应用更新。开发监听没有发布构建时间，不显示启动后的版本变化提示。

更新清理与“我 → 系统设置 → 清除缓存”共用同一流程：清除本地存储（包括登录、主题及本地设置）、使账号内存缓存和旧请求失效，并删除微信保存文件缓存及应用生成的临时文件，之后需要重新登录。云端业务数据不变。微信管理的代码包、网络临时缓存由微信自身控制，业务代码不能删除全部微信缓存；新代码包以 `applyUpdate()` 应用结果为准。微信图片分支模拟命令为 `node tests/wechat-ui/time-donut.mjs`，模拟成功不能替代开发者工具及真机验收。

## Android / iOS App

安装匹配的 HBuilderX 后执行：

```bash
npm run prepare:app
```

用 HBuilderX 打开生成的 `artifacts/android/AIO-Life-App`。这是当前源码的准备工程，修改业务源码后需重新生成；不要把生成目录当作源代码目录维护。DCloud AppID、地图 SDK Key、签名和证书按 [App 开发与验证](docs/App开发与验证.md)配置，保留在本地环境或忽略工程中。该命令不会生成签名 APK / IPA，也不会上传或发布。

## 构建与验证

| 命令 | 用途 |
| --- | --- |
| `npm run build` | H5 生产构建，产物为 `dist/build/h5` |
| `npm run preview` | 在 5180 端口预览已有 H5 产物，不重新构建 |
| `npm test` | 单元、接口契约与静态规范检查，包含间距、排版和底栏生成物检查 |
| `npm run test:e2e` | 构建当前 H5，使用模拟 API 验证业务与布局 |
| `npm run e2e:check` | E2E 统一入口、诊断与历史脆弱写法预算检查 |
| `npm run test:commit` | 提交前依次执行单元/规范、完整 H5 E2E、微信构建与包体检查 |
| `node tests/wechat-ui/run.mjs` | 在独立测试副本模拟微信登录分支，不调用真实微信 |

日常开发按需运行受影响用例；准备提交最终代码时执行一次 `npm run test:commit`，纯文档或注释修改只检查差异。该入口是手动命令，不是自动 Git hook，也不会提交代码。E2E 已包含 H5 构建，无需重复执行 `npm run build`；运行前释放 5180 端口，测试不复用开发服务器或历史预览。微信授权分支另做专项模拟，视觉改动检查手机、平板、桌面及深浅主题。

统一验证遇到失败立即停止，完整日志保存在 `artifacts/commit-validation/` 的独立运行目录中。修复后只重跑受影响阶段，影响不明确时重新完整验证；相同代码与环境不重复已通过检查。提交前检查生成物差异，不能漏交需要同步的资源。

E2E 的 `failure-context`、HTML、trace 和截图用于定位失败，分组摘要在 `artifacts/e2e-diagnostics/`。本地默认 1 个 worker，可用 `PLAYWRIGHT_WORKERS=4 npm run test:commit` 调整；CI 复用同次工作流的 H5 产物并分片回归，配置以 [ci.yml](.github/workflows/ci.yml) 与 [playwright.config.js](playwright.config.js) 为准。用例维护与失败分类见 [E2E 测试维护与故障定位](docs/E2E测试维护与故障定位.md)。这些检查不替代真实后端联调、微信 / App 真机或发布验证。

## 目录与维护入口

```text
src/
├── main.ts            # 应用入口
├── App.uvue           # 主题与初始化
├── pages.json         # 页面路由、底栏与分包声明
├── manifest.json      # Vapor 与平台配置
├── pages/             # 业务页面及各分包专属组件、服务
├── components/        # 跨业务公共组件
├── services/          # 请求、会话、契约与公共能力
├── styles/            # 间距、排版配置及生成物
└── uni_modules/       # App 安全随机数、原生图标、微信读书桥接
scripts/               # 资源生成、平台构建与验证入口
tests/                 # 单元、契约、H5 E2E 与微信专项模拟
docs/                  # 专题说明与标日期的历史验证
```

| 维护主题 | 入口 |
| --- | --- |
| 业务与当前接口 | [功能与接口](docs/功能与接口.md)、[时迹专项](docs/时迹开发与验证.md) |
| 图标、间距、排版、底栏生成 | [图标与样式维护](docs/图标与样式维护.md)；图标同步需相邻 Web 仓库，正常构建使用已提交的生成资源 |
| 日期与弹窗公共组件 | [CalendarPicker](src/components/CalendarPicker.uvue)、[WeixinModalBackGuard](src/components/WeixinModalBackGuard.uvue)；复用公共日期算法及微信返回保护 |
| 开发与跨端约定 | [AGENTS.md](AGENTS.md)、[跨端文档目录](../docs/README.md)；独立克隆时查看[主仓库文档](https://github.com/lys1313013/aio-life/blob/main/docs/README.md) |
| 平台历史结果与限制 | [历史验证记录](docs/历史验证记录.md)、[App 开发与验证](docs/App开发与验证.md)，历史结果不代表当前工作区已验证 |

接口 ID 保留字符串，业务成功判断使用整数 `code === 0`，请求统一通过 `src/services/api.ts`。业务专属依赖归对应分包，公共资源与生成文件遵循开发规范。凭据、Token、证书、真实 AppID 和真实用户截图不进入 Git。
