# AIO Life Mobile

AIO Life 的独立跨端客户端，采用 **uni-app x + Vapor 蒸汽模式**。提供账号密码登录及首页、时迹、全部、我四栏，连接现有 Spring Boot 后端。

## 文档入口

- [功能与接口](docs/功能与接口.md)：已实现业务、GET 自动重试、导航、缓存、扫码登录及生活足迹。
- [微信部署](docs/微信小程序部署说明.md)、[构建与包体](docs/微信小程序构建与包体.md)。
- [App 开发与验证](docs/App开发与验证.md)：匹配 HBuilderX、准备工程、原生模块和平台边界。
- [图标与样式维护](docs/图标与样式维护.md)、[时迹专项](docs/时迹开发与验证.md)。
- [历史验证记录](docs/历史验证记录.md)：历史构建、失败和上传快照。
- [开发规范](AGENTS.md)、[跨端文档目录](../docs/README.md)。独立克隆时查看[主仓库文档](https://github.com/lys1313013/aio-life/blob/main/docs/README.md)。

## 快速启动

需要 Node.js 20.19+（本项目开发使用 Node 22）和 npm。

```bash
npm ci
# 仅首次创建；已有配置不要覆盖
cp .env.example .env.local
npm run dev
```

访问 `http://127.0.0.1:5180`，使用现有 AIO Life 账号。默认通过开发代理连接 `http://127.0.0.1:45678/api`。仓库不包含账号密码或 Token。

微信开发使用 `npm run dev:weixin`，等待终端出现 `Build complete. Watching for changes...` 后，在微信开发者工具打开 `dist/dev/mp-weixin`，并保持监听进程运行。需要连接线上接口时使用 `VITE_API_BASE_URL=https://aiolife.top/api npm run dev:weixin`。`npm run build:weixin` 是一次性发布构建，不能代替源码监听；完整流程及不更新时的排查步骤见[开发时自动更新](docs/微信小程序构建与包体.md#开发时自动更新)。

环境变量：

| 变量 | 用途 |
| --- | --- |
| `AIO_API_PROXY_TARGET` | Web 开发代理目标，例如 `http://127.0.0.1:45678`，不含 `/api` |
| `VITE_API_BASE_URL` | 小程序 / App 完整 API 地址，必须以 `/api` 结尾；未配置时生产构建默认 `https://aiolife.top/api`，开发默认本机后端 |
| `VITE_WEB_API_BASE_URL` | Web API 地址，默认同源 `/api` |

手机访问本机后端时，`VITE_API_BASE_URL` 应设为电脑的局域网地址；`localhost` 指手机自身。生产环境使用 HTTPS，Web 部署需配置同源 `/api` 反向代理或正确的 CORS。`VITE_*` 会进入客户端包，只能放公开配置。

## 构建与验证

```bash
npm run build          # dist/build/h5
npm run dev:weixin     # 持续监听 → dist/dev/mp-weixin；保持进程运行
npm run build:weixin   # 一次性发布构建 → dist/build/mp-weixin，含官方包体检查
npm test              # 真实响应格式、业务错误、401、长 ID 等纯逻辑测试
npm run test:e2e       # 使用模拟 API 验证完整 H5 业务与布局
npm run test:commit    # 提交前统一验证：单元/规范 → H5 E2E（含构建）→ 微信构建/包体
node tests/wechat-ui/run.mjs # 独立测试副本模拟小程序登录分支，不调用真实微信
```

日常修改不自动执行全量测试或双端构建，排查问题时按需运行相关用例；准备 Git 提交时，对最终代码统一执行一次 `npm run test:commit`。纯文档、注释修改只检查差异。该命令是手动入口，不是自动 Git hook，不会提交代码。涉及微信授权分支时还需执行上面的独立模拟脚本，视觉改动仍需查看受影响页面的多尺寸、深浅主题截图。

日期选择统一通过 `src/components/CalendarPicker.uvue`：表单使用 `FormField kind="date"`，自定义入口使用组件默认插槽。组件接收 `value`、`start`、`end`（`YYYY-MM-DD`）、`disabled`、`label`，通过 `change` 的 `event.detail.value` 返回日期；`fields="month"` 使用月份面板并返回 `YYYY-MM`。范围限制由业务传入，禁止在页面复制日历算法或直接使用日期滚轮。打开后展示周一至周日的月历，点击年月可切换面板，点选日期立即回填，关闭不修改原值。统一复用 `AdaptiveModal`、间距、排版和主题配置，不新增 npm 依赖。日期计算集中在 `src/services/calendar.ts`，时间选择继续使用原有公共时间控件。

此方案对应 Vapor 约束：旧版 uni-ui 的 `uni-datetime-picker` 不能直接接入蒸汽模式，见 [DCloud 官方组件迁移说明](https://doc.dcloud.net.cn/uni-app-x/component/uni-ui-x/)。新增日历的 H5 多尺寸深浅主题、嵌套弹窗、微信包体和各端行为仍按提交前流程验收，源码接入不代表真机验证完成。

微信弹窗返回由 `WeixinModalBackGuard` 统一接入原生 `page-container`：同一页面共用一个返回容器，每次系统返回只请求关闭最上层弹窗，所有弹窗关闭后恢复页面原有返回行为。覆盖 `AdaptiveModal`（含日历）、`TimeEndPicker` 和 `ConfirmAction`，保存或删除中仍保留 busy 关闭保护。返回容器不绘制遮罩，不改变页面内 tabBar 和现有弹窗布局。此处理仅在微信编译分支启用；右上角胶囊的关闭小程序按钮不属于本次拦截范围。机制与限制见 [DCloud page-container 文档](https://doc.dcloud.net.cn/uni-app-x/component/page-container.html)。提交前需验证首页及二级页的系统返回、连续嵌套返回、取消/保存后正常返回、busy、页面切换和卸载清理，并在微信真机检查 Android 返回键及 iOS 返回手势；模拟事件不能代替真机验收。

统一验证遇到失败立即停止，终端仅显示阶段耗时、结果、日志路径及失败日志末尾；完整日志保存在 `artifacts/commit-validation/` 的独立运行目录中。提交前入口会强制关闭 `AIO_E2E_PREBUILT`，确保 E2E 构建当前 H5 源码，不必再单独运行 `npm run build`；CI 的独立 E2E 分片仍可复用同次工作流产物。失败后根据对应日志定位，修复后只重跑受影响的阶段或用例；代码、依赖、配置和相关环境未变时不重复已通过检查，影响不明确时重新运行完整命令。此命令检查当前工作区，提交前需核对最终提交内容及构建生成物差异。

本机 E2E 使用已安装的 Google Chrome。CI 使用 [Playwright 官方镜像](https://playwright.dev/docs/docker)，镜像版本从 lockfile 安装后的 Playwright 包读取，浏览器与系统依赖已预装，不再由每个分片重复下载。测试截图、报告和 trace 均在 Git 忽略目录中。

E2E 会先构建 H5，再通过 `npm run preview` 启动生产产物的静态预览，避免开发服务器的依赖预构建刷新页面、破坏测试登录态。运行前需释放 5180 端口；测试不复用已有开发服务器或旧预览。

GitHub Actions 的 `Unit tests and H5 build` 只构建一次 H5，并上传同次提交的 `h5-<sha>` 产物（保留 1 天）；`Weixin build and package size` 独立并行执行。完整浏览器回归仍分为 4 个 `Browser regression` 任务，每片使用 2 个 worker，并通过 `AIO_E2E_PREBUILT=1` 预览下载的 H5 产物，不重复构建。缺少产物时直接失败，不回退到旧预览或开发服务器。

本地默认仍是 1 个 worker，也不会复用旧构建。机器资源充足时可用 `PLAYWRIGHT_WORKERS=4 npm run test:commit` 并行执行完整提交前回归；复现 CI 单个分片可运行 `npm run test:e2e -- --shard=1/4 --workers=2`。回归失败仍会使工作流失败，不跳过用例。每个分片保留 7 天 HTML 报告、失败截图和 trace，可从 Actions 的 `playwright-*` 附件下载；新提交会取消同分支的旧任务。
