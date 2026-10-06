# AIO Life Mobile

AIO Life 的独立跨端客户端，采用 **uni-app x + Vapor 蒸汽模式**。提供账号密码登录及首页、时迹、全部、我四栏，连接现有 Spring Boot 后端。

## 已实现

- 账号密码登录、输入校验、提交 loading 与错误提示。
- 微信小程序支持微信身份登录、无需手机号的微信注册、原账号密码验证后绑定，以及微信账号首次设置密码；功能由后端开关控制，Web / App 保留账号密码入口。
- 保存 Token，重新打开后恢复登录；HTTP 401 清理会话并返回登录页。
- 自定义导航通过 `PageHeader` 共用：微信端按实际胶囊位置避让，首页顶部提供功能搜索入口，“全部”页搜索与时迹日期切换直接放进导航栏；返回和标题同行，保留状态栏与至少 44px 点击区。窗口尺寸变化时重新测量，Web 首页维持无导航栏布局。
- “全部”提供授权功能目录、搜索及常用功能编辑。名称、分组层级和顺序统一使用服务端菜单树，遵循角色权限与菜单显示偏好，不按路径另加分组；移动端仅排除已由底栏提供的首页入口，并将关于统一放在“我”；常用功能与 Web / 首页共用配置，最多 12 项，支持增删、按钮排序、启停、取消和失败重试，保留未编辑的停用及目录外已有配置。
- 原生底部导航：首页 / 时迹 / 全部 / 我，图标选中态、深浅色及底部安全区；登录页隐藏导航。
- 时迹提供时间轴 / 卡片双视图并记住选择；00:00–24:00 时间轴随视口高度压缩，色块保留真实时长比例和分类图标，周 / 月横向滑动日期，卡片按日期分组。短记录可通过日期列表或卡片编辑。
- 分类支持多选、子分类匹配、重置与取消；时间轴淡化未选记录，卡片与统计过滤选中范围。统计包含累计、未记录、记录日均、上期对比、关注分类对比、分类时长 / 占比、时间类型、每日分类分布及近 10 日 / 周 / 月趋势；默认分类归并一级，筛选后展示明细，周 / 月趋势按全部有记录天数计算日均。趋势按需请求、局部 loading 和失败重试，使用跨端堆叠条形展示。
- 通用 `FloatingActionButton.uvue` 提供渐变、高光、阴影、按压反馈、无障碍名称、禁用 / loading 和位置参数。时迹新增按钮使用该组件，放在滚动容器外、原生底栏上方。
- 新增 / 编辑 / 删除时迹使用居中、自适应高度弹窗，普通内容自然撑高，长内容在视口内滚动。首页、时迹页及独立编辑入口统一使用精简布局：无弹窗标题和关闭按钮，日期无箭头；分类、起止时间、自动时长直接展示，运动明细和阅读 / 观影关联紧接时间，标题和描述放在附属记录之后，点击时间使用原生 picker，点击遮罩关闭。分类选择展示四列彩色图标网格。各入口共用服务端推荐、时间冲突校验、保存与删除逻辑，保留运动明细；阅读 / 观影关联采用封面、名称和状态卡片，选择弹窗使用手机三列 / 平板桌面四列封面网格，支持搜索、显示全部及分页；完整详情失败时禁止提交，更新保留附属字段。
- 首页时迹卡片右上角保留“距上次记录时长 ＋”入口，每分钟更新；最近记录可点按编辑。首页快捷录入使用今天，时迹页新增使用所选日期，只查询录入日期的推荐时段。
- 首页 / 时迹 / 全部 / 我统一下拉刷新，移除导航栏与卡片常驻刷新按钮，失败可局部重试；“我”提供账户资料与退出确认。
- 首页按现有 `/analytics` 仪表盘布局：统计卡片、时迹环图与时间轴、快捷导航、关注待办、固定闪念、运动趋势、GitHub 最近提交。
- 首页使用真实接口；卡片独立 loading / 重试，未绑定或无数据的可选模块隐藏，运动与提交支持分页加载。隐藏闪念不会显示原文。
- 手机 / 平板 / 桌面分别采用单列 / 双列 / 三列内容卡片，顶部统计卡片采用双列 / 五列；保留系统深浅色。
- 退出前在按钮旁确认；请求失败时仍清理本机登录状态，并提示服务端注销未完成。
- 浅色 / 深色跟随系统，页面宽度适配手机、平板与桌面。

全功能迁移以主仓库的 `docs/Mobile全功能迁移任务清单.md` 和 `docs/mobile-migration/` 为台账。任务、记录、财务、物品、密码库、消息、编程、关系、管理及个人设置均已接入客户端业务页；本地操作验证与平台验收分别记账。仅从服务端授权菜单生成“全部”入口，未知自定义菜单才保留“网页版”跳转，不传递本机Token。鼠标拖拽和悬停操作改为触屏按钮/选择器/可拖动关系节点，图表使用跨端基础组件。App 微信 OAuth、短信登录和离线同步不属于现有Web业务迁移。

本次源码与验证范围：

- 共用 `MobileButton`、`ConfirmAction`、`FormField`、`MobilePage`、`PageState`、`AttachmentField`、`AioChart`，编辑弹窗统一使用 `AdaptiveModal`；确认靠近操作按钮、错误保留表单、加载与再次提交有状态。
- 新业务页面按目录配置 `subPackages`，底部四栏保留主包；微信启用按需组件加载。包体最终以构建结果为准，编译成功不代表可直接发布。
- 个人设置覆盖菜单显示/菜单锁、API Key、模型配置、通知、MBTI/CBTI、注册与密码找回。菜单2001先验证二级密码，再重试被拦截的请求一次；普通写入失败不自动重复发送。
- Mobile 跳转检查复用当前登录的菜单锁配置和菜单树，内存缓存 12 小时（空锁列表也缓存），并发检查合并请求；命中缓存不显示检查遮罩。切换账号、成功修改菜单锁/二级密码/管理菜单或接口返回 2001 时清除缓存；过期后重新加载，失败不放行，业务接口仍由服务端校验，密码解锁时长保持不变。其他客户端修改配置后，本地导航配置最迟在缓存过期时刷新，服务端仍按最新配置校验业务访问。
- 密码库兼容Web既有密文格式，主密码和解密值只在内存中，离页/换账号清除。Web、微信与App Android/iOS分别接安全随机数；App UTS桥接需要匹配版本HBuilderX联编验证。Swift原生实现的本机编译不能替代App验证。
- 文件导入支持本地预览、编辑和失败恢复；Web、微信与 App 共用文档选择服务，App 使用系统选择器并将 content URI 复制到沙盒后解析/上传。App 分支已做模拟契约检查，仍需匹配 HBuilderX 的真机验证。
- `vite.config.js` 包含LeetCode开发代理；生产环境需要同路径代理，微信须配置第三方合法域名。第三方测试、同步与外部API仍需真实环境联调。
- 本轮只用模拟数据测试写操作，无真实账号密码变更、消息发送、文件绑定或记录写入。Web模拟E2E、微信构建、真实后端、微信/App真机分别记录，不互相替代。

## 快速启动

需要 Node.js 20.19+（本项目开发使用 Node 22）和 npm。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

访问 `http://127.0.0.1:5180`，使用现有 AIO Life 账号。默认通过开发代理连接 `http://127.0.0.1:45678/api`。仓库不包含账号密码或 Token。

环境变量：

| 变量 | 用途 |
| --- | --- |
| `AIO_API_PROXY_TARGET` | Web 开发代理目标，例如 `http://127.0.0.1:45678`，不含 `/api` |
| `VITE_API_BASE_URL` | 小程序 / App 完整 API 地址，必须以 `/api` 结尾 |
| `VITE_WEB_API_BASE_URL` | Web API 地址，默认同源 `/api` |

手机访问本机后端时，`VITE_API_BASE_URL` 应设为电脑的局域网地址；`localhost` 指手机自身。生产环境使用 HTTPS，Web 部署需配置同源 `/api` 反向代理或正确的 CORS。`VITE_*` 会进入客户端包，只能放公开配置。

## 构建与验证

```bash
npm run build          # dist/build/h5
npm run build:weixin   # dist/build/mp-weixin
npm test              # 真实响应格式、业务错误、401、长 ID 等纯逻辑测试
npm run test:e2e       # 使用模拟 API 验证 Web 登录流程、断网恢复和六组布局
npm run test:commit    # 提交前统一验证：单元/规范 → H5 E2E（含构建）→ 微信构建/包体
node tests/wechat-ui/run.mjs # 独立测试副本模拟小程序登录分支，不调用真实微信
```

日常修改不自动执行全量测试或双端构建，排查问题时按需运行相关用例；准备 Git 提交时，对最终代码统一执行一次 `npm run test:commit`。纯文档、注释修改只检查差异。该命令是手动入口，不是自动 Git hook，不会提交代码。涉及微信授权分支时还需执行上面的独立模拟脚本，视觉改动仍需查看受影响页面的多尺寸、深浅主题截图。

统一验证遇到失败立即停止，终端仅显示阶段耗时、结果、日志路径及失败日志末尾；完整日志保存在 `artifacts/commit-validation/` 的独立运行目录中。E2E 已构建 H5，不必再单独运行 `npm run build`。失败后根据对应日志定位，修复后只重跑受影响的阶段或用例；代码、依赖、配置和相关环境未变时不重复已通过检查，影响不明确时重新运行完整命令。此命令检查当前工作区，提交前需核对最终提交内容及构建生成物差异。

本机 E2E 使用已安装的 Google Chrome。CI 使用 `npx playwright install --with-deps chromium` 安装浏览器。测试截图、报告和 trace 均在 Git 忽略目录中。

E2E 会先构建 H5，再通过 `npm run preview` 启动生产产物的静态预览，避免开发服务器的依赖预构建刷新页面、破坏测试登录态。运行前需释放 5180 端口；测试不复用已有开发服务器或旧预览。

GitHub Actions 将单元测试与 Web / 微信编译放在 `Unit tests and Web / Weixin builds`，完整浏览器回归分为 4 个 `Browser regression` 任务；回归失败仍会使工作流失败，不跳过用例。先查看具体失败步骤，浏览器测试失败不代表打包失败。每个分片保留 7 天 HTML 报告、失败截图和 trace，可从 Actions 的 `playwright-*` 附件下载；新提交会取消同分支的旧任务。复现单个分片可运行 `npm run test:e2e -- --shard=1/4`。

### 本地业务图标

`src/services/icons/catalog.ts` 读取生成阶段已合并的本地图标目录，供菜单、首页、运动记录和分类编辑使用。`business-icons.json` 按实际引用同步 Web 路由菜单、字典分类预设、Web 显式图标清单、mobile 源码图标和完整运动预设，并包含 Web 自定义 SVG（含 9 个运动图标）。同步覆盖 Lucide、Ant Design、MDI 等引用到的集合，保留原始名称、比例和颜色，不全量打包所有图标库；运行时不访问外部图标服务。服务端自定义的任意图标若未在上述来源中声明，仍需先加入 Web 显式图标清单再同步。

Web 更新图标后执行 `npm run icons:sync`，用 `npm run icons:check` 检查同步结果。同步时生成 `catalog.generated.json`，按通用、操作、业务的顺序合并去重，运行时只打包这一份目录，保留所有图形和运动预设。这两个维护命令需要相邻 `aio-life-front` 源码及其已安装的 `@iconify/json`；生成的 JSON 随 mobile 提交，正常构建无需 Web 仓库。

#### 菜单管理中配置新图标

**在 Web 菜单管理中保存图标编号，不会自动把图形加入 mobile 安装包。** Web 能预览某个图标，也不代表 mobile 已收录；mobile 不会在缺失时向 Iconify 下载图标。菜单组件 `LifeMenuIcon.uvue` 找不到本地名称时显示 `lucide:layout-dashboard`，直接使用 `CategoryIcon.uvue` 的其他入口则显示圆点。已收录图标从本地 SVG 数据渲染，不依赖外部图标服务。

新增前先在 mobile 仓库检查完整编号，例如 Chrome 风格的密码钥匙：

```bash
node --input-type=module -e "import fs from 'node:fs'; const name = 'material-symbols:vpn-key-outline-rounded'; const catalog = JSON.parse(fs.readFileSync('src/services/icons/catalog.generated.json', 'utf8')); const found = Object.hasOwn(catalog.icons, name); console.log(name + ': ' + (found ? '已收录' : '未收录')); process.exitCode = found ? 0 : 1;"
```

未收录时按以下步骤维护（上述编号仅作示例，不表示已加入资源）：

1. 将完整编号加入相邻 Web 仓库 `scripts/icons/local-icons.config.json` 的 `icons` 数组。mobile 同步脚本读取该数组，不会把 `collections` 中的整个集合打包进来，也不会自动扫描数据库菜单配置。只为单个菜单补充所需图标，避免引入整套图标库。
2. 在 Web 仓库生成并校验资源：

   ```bash
   cd ../aio-life-front
   pnpm icons:generate
   pnpm icons:check
   ```

3. 在 mobile 仓库同步并校验：

   ```bash
   cd ../aio-life-mobile
   npm run icons:sync
   npm run icons:check
   ```

   若脚本报图标不存在或别名变换不受支持，应核对完整名称和当前锁定版本的 `@iconify/json`；不能仅凭在线预览成功就跳过校验。不要手工修改生成 JSON。
4. 再次执行完整编号检查。`icons:check` 只验证声明来源与生成物一致，不检查数据库中所有动态配置是否已覆盖。分别在 Web、mobile 独立仓库保存配置及生成物；mobile 生成物包括 `business-icons.json` 和 `catalog.generated.json`。
5. 准备提交时按本仓库规范执行统一验证，关注微信包体以及目标菜单在深浅色主题中的显示。构建并发布对应客户端后，新资源才会到达用户；旧版小程序或 App 即使收到新菜单编号，仍会显示兜底图标。微信构建、上传、体验版及正式发布是不同阶段。

推荐先发布包含新图标的客户端资源，再切换菜单编号。若已提前配置，可先恢复已收录的编号，或接受旧客户端暂时显示兜底图标。Web 侧维护说明见相邻仓库的 `scripts/icons/README.md`。

此前首页验证（2026-09-30，早于微信登录接入）：真实本地后端账号登录、首页统计与各模块读取、刷新恢复登录已通过；6 项纯逻辑测试、15 项 Web E2E（包含 390 / 768 / 1440px 深浅色、卡片独立重试、并发 401、空账号、分页恢复、三栏切换与退出后重新登录）已通过。微信开发者工具已验证真实接口登录、首页、三栏导航与资料读取；微信真机仍需扫码验证。iOS / Android 未构建安装包、未做 Vapor 真机测试。

本次微信登录验证（2026-09-30）：15 项契约测试、Web / 微信小程序构建通过；微信登录界面的 390 / 768 / 1440px 深浅色、拒绝授权、注册、首次设密、原账号绑定和能力加载失败重试通过独立模拟验证。后端 45 项相关测试使用独立 MySQL / Redis，通过微信测试替身验证完整认证链路。真实微信授权、目标环境迁移和发布尚未执行。

### 微信小程序

首次在本机配置小程序：

```bash
cp project.config.example.json src/project.config.json
# 在 src/project.config.json 中填写自己的 appid，然后构建。
npm run build:weixin
```

`src/project.config.json` 已加入 Git 忽略，由微信编译器复制为产物的 `project.config.json`，不回写源码 manifest。真实 AppID 不提交；`src/manifest.json` 中的 AppID 保持空值。未提供本地配置时，CI 仍可验证构建，但产物不能直接用于正式上传。

发布配置启用 `minified`、`minifyWXSS`、`minifyWXML`，并关闭 `uploadWithSourceMap`。已有本地 `src/project.config.json` 也需同步这些 `setting` 字段，否则会覆盖默认配置。主包大小以微信开发者工具上传检查为准，超过 2 MB 会被拒绝；源码构建成功不能替代上传检查。

#### 本地包体检查与 CI

```bash
npm run check:weixin-size       # 重新构建微信目标并检查包体
npm run build:weixin            # 同样自动执行 postbuild:weixin 包体检查
npm run check:weixin-size:only  # 只检查已有 dist/build/mp-weixin，适合诊断；不会重建源码
```

检查使用固定版本 `miniprogram-ci@2.1.31` 的 `getCompiledResult`，读取产物的发布压缩设置，再按编译后的 `app.json` 分包根目录统计 UTF-8 / 二进制文件字节数。主包及每个分包独立按 **1900 KB 预警、2048 KB 硬上限** 检查，主包额外执行 **1600 KB 工程预算**（1 KB = 1024 字节）；超工程预算、超硬上限、缺失产物、编译失败或发布配置漂移均返回非零退出码。预览的 `bigPackageSizeSupport` 不会放宽本地阈值。

终端列出各包大小、剩余额度、主包最大的 10 个文件；`artifacts/weixin-size/report.json` 保留各包全部文件清单，`report.txt` 为简短报告，`chunks.json` 记录各 JS 文件的模块贡献和实际同步依赖（uni/Rollup 阶段字节数仅用于定位，最终限额以官方编译后的 `report.json` 为准）。微信构建开始即清除旧报告；若前面的 uni 构建失败，不会留下旧的体积通过报告。CI 的构建任务运行同一命令，并保存报告 7 天，超预算或超限会使任务失败。

检查在临时副本上运行，不改开发者工具项目，也不调用 `preview` / `upload`、不更新体验版。离线适配使用编译器默认项目属性和 `touristappid`，无需真实 AppID、上传私钥、IP 白名单或 CI Secrets；内部非密钥占位值只满足官方 Project 构造器参数要求，不用于鉴权。涉及插件或账号特定能力时不能据此声称已验证，当前检查会拒绝插件项目。此适配固定编译器版本，升级时必须重新验证；它统计编译后的文件字节数，不是 ZIP 大小，也未包含服务端最终封装开销，上传端仍保留最终校验。[微信官方编译接口](https://github.com/wechat-miniprogram/miniprogram-ci-dist#获取本地编译后的代码包)

工具会忽略开发者工具的私有运行配置，但若其覆盖了发布编译选项则直接报错，避免两套压缩配置产生误判。Node 25 的 Web Storage 与官方编译器存在兼容问题，检查进程及其子进程会单独关闭该实验特性；CI 继续使用 Node 22。

2026-10-02 本地验证：当前主包为 2037.26 KB，触发 1900 KB 预警但未超过硬上限；将优化前的 `90608e5` 在独立忽略目录重新构建后测得 2069.64 KB，Node 25 / Node 22 均返回退出码 1，与此前微信上传约 2070 KB 超限一致。该复现未上传代码。以上为本次测量记录，后续以重新构建的报告为准；CI 工作流已配置，未据此声称远端运行通过。

业务专属模块随分包存放：CBTI 海报组件及二维码在 `pages/personality`，聊天流与 Markdown 在 `pages/messages`，图谱布局在 `pages/relationship`，MCP 参数校验在 `pages/mcp`。公共目录中的源码会进入主包，不能仅因调用方是分包就假定它会自动迁移。

重量 npm 依赖采用微信专用分包构建：`scripts/weixin-package-policy.json` 声明所属分包与导出，Vite 插件从锁定的原依赖生成分包私有副本。财务分包持有 Excel、ZIP、编码表；阅读分包持有 Excel；密码库分包持有 SM4 与 PBKDF2。共享小工具仍在主包。插件会拒绝重量依赖进入主包和普通分包之间的同步引用，Web/App 保持正常依赖解析。允许必要的分包间代码副本以换取主包余量；不删减 CSV、GBK、ZIP、Excel 导入或现有加密能力。维护步骤见 `AGENTS.md` 的“避免主包再次超限”。

2026-10-03 本轮优化测量：主包由 2056.09 KB 降至 1116.46 KB，较微信硬上限剩余 931.54 KB，低于 1600 KB 工程预算；最大业务分包为 1019.08 KB，全包合计 3362.29 KB（Excel 分包副本增加了全包总量）。微信构建、官方离线编译包体检查及 H5 构建完成，JS 相对引用无缺失。按用户要求未运行单元/E2E，未上传、未发布、未做真机或 App 验收。数字只代表本次构建快照。

2026-10-03 上传版本 `1.0.20261003.1`：微信开发者工具 CLI 返回 `✔ upload`、退出码 0，实际上传主包 1133.09 KB、全包 3399.54 KB；本地官方编译检查主包 1132.67 KB，低于 1600 KB 工程预算。API 为 `https://aiolife.top/api`，发布压缩开启、SourceMap 上传关闭。155 项单元测试通过；完整 H5 回归首轮 901 通过、2 失败，修复滚动节流等待与选择器取消辅助函数后，受影响的 7 项分页和 4 项选择器回归全部通过，903 项均有通过结果。`test:commit` 首轮因这两项失败退出，微信阶段另行执行并通过，未重复构建 H5。日志位于本机忽略目录 `artifacts/commit-validation/2026-10-03T01-21-00-991Z-37209/` 和 `artifacts/commit-validation/push-weixin-20261003/`。本次未确认体验版是否自动更新，未提交审核、未正式发布、未做真机验证；开发者工具主包大小建议检查通过，仍提示部分业务共享 JS 未被主包直接使用。

2026-10-02 上传版本 `1.0.20261002`（基于 `90608e5` 加本次分包调整）：首次上传主包 2070 KB，超过 2048 KB；移动上述专属模块后重新构建，微信开发者工具明确显示“代码上传成功”，并按上传前提示覆盖既有体验版。API 为 `https://aiolife.top/api`；未提交审核、未正式发布、未做真机验证。工具仍提示主包超过建议的 1.5 MB、部分主包 JS 未被主包直接使用，后续新增功能仍需实际上传检查。

本次 130 项单元测试、H5 / 微信构建通过，产物相对 JS 依赖无缺失；15 项相关 Web 模拟回归通过（六组领域页面加载、MCP 失败重试、两组 Markdown 表格、六组 CBTI 海报生成）。5180 已有开发服务，本次在忽略目录复制测试并将固定 API 拦截地址改为 5187，独立启动生产预览；初次仅改预览端口时因旧拦截地址未匹配而失败，不能算产品失败。原综合用例的海报流程通过，但后续时迹兼容编辑的旧关闭按钮定位超时，未将该综合用例记为通过。部署测试副本与日志保存在本机忽略目录 `artifacts/weixin-deploy/`。

后端先执行用户表迁移，再配置 `AIO_LIFE_WECHAT_MINI_ENABLED=true`、`AIO_LIFE_WECHAT_MINI_APP_ID` 和服务端 `AIO_LIFE_WECHAT_MINI_APP_SECRET`。AppID 应与本地 `src/project.config.json` 的 `appid` 一致。AppSecret 不得放入客户端或 `VITE_*` 变量。能力未启用时自动保留账号密码登录。

首次微信登录可选择手机号授权注册或登录原账号绑定；已有微信绑定后无需重复手机号授权。手机号已占用时必须验证原账号密码。临时票据只保存在页面内存，不能作为 Token 使用；取消授权可重试，凭证失效需要重新微信登录。新用户可在登录后设置密码，也可跳过。

手机号能力还依赖微信主体认证、可用额度、隐私指引和合法域名。`tests/wechat-ui/run.mjs` 将源码复制到忽略目录，模拟平台回调验证交互与 390 / 768 / 1440px 深浅色，**不等同于微信开发者工具或真机验证**。不会给生产页面添加模拟入口。


在微信开发者工具中导入 `dist/build/mp-weixin`，配置自己的小程序 AppID。正式使用时配置 HTTPS request 合法域名；本地联调可仅在开发者工具中临时关闭域名校验。框架编译通过不等同于真机验证或审核通过。

### iOS / Android

`src/manifest.json` 已设置：

```json
{
  "uni-app-x": {
    "vapor": true,
    "styleIsolationVersion": "2",
    "vapor-render-target": "bytecode"
  }
}
```

项目 npm 编译器统一固定为 **5.31 Alpha 对应版本 `3.0.0-alpha-5030120260930001`**，使用同版本 HBuilderX 5.31 Alpha，按下文准备并导入独立 App 工程。页面使用组合式 API，`.ts` 中使用 JS/TS 业务逻辑；只有打开网页版链接的 `window.open` 放在 `WEB` 条件编译内，App / 小程序采用 `uni.*`。统计折线图和柱状图统一使用 `AioChart.uvue`，内部由 ECharts 6.0.0 绘制；页面只提供数据、单位和交互选项。Canvas 获取、尺寸变化与触摸处理集中在 `ChartCanvas.uvue`，深浅主题、坐标轴和数值格式统一管理。微信图表引擎由构建插件按需裁剪后放入 `chart-runtime` 共享分包，通过 `require.async` 加载；加载失败可重试，不静态进入主包。该分包登记的空 `bootstrap` 页面仅满足微信分包规则，没有业务导航入口。Web 和 App 使用同一套 ECharts 配置与 Canvas 适配。该版本属于 Alpha 通道，升级编译器时须重新执行跨端验证。2026-10-04 本机已安装 HBuilderX 5.31 Alpha（保留原 5.26 正式版），Android 原生编译和云打包通过，iOS App 资源编译通过。未安装完整 Xcode，未生成签名 IPA；资源编译不能代替 iOS 原生联编和真机验证。

执行 `npm run prepare:app` 生成 `artifacts/android/AIO-Life-App`，再用匹配版本的 HBuilderX 打开这个工程。该步骤复制当前源码、保留本地 DCloud AppID，并提供 App 专用依赖转换和生产 API 配置；生成物全部被 Git 忽略。首次在生成工程的 manifest 可视化界面获取自己的 DCloud AppID，或通过本地环境变量 `AIO_DCLOUD_APP_ID` 配置，再选择「发行 → 原生 App 云打包」。Android 可使用云端证书；iOS 需自己的 Bundle ID、Apple 签名证书和描述文件。不要提交证书、私钥或真实 AppID；源码 manifest 保持空 AppID。

2026-10-04 小米 14 真机定位到 5.31 云包的 C++ 运行库不匹配：`libuniappx.so` 引用了云包中 `libc++_shared.so` 缺失的 `__from_chars_floating_point` 符号，导致页面初始化前黑屏。`prepare:app` 现在从已安装的同版本官方 Vapor 基座提取匹配的 arm64 C++ 库，通过忽略工程中的 UTS `libs` 目录参与云打包，并校验两份库的 SHA-256。默认 HBuilderX 路径为 `/Applications/HBuilderX-Alpha.app/Contents/HBuilderX`，可用 `AIO_HBUILDERX_ROOT` 指定；升级 HBuilderX 后必须重新验证，不能继续套用旧运行库。二进制不进入源码仓库。

APK 下载后执行 `node scripts/check-android-runtime.mjs <apk路径>` 检查实际原生库的 C++ 导入符号，再做签名校验、覆盖安装和冷启动检查。2026-10-04 小米 14 已验证登录、首页统计及快捷导航图标、首页时迹图表与记录、记录编辑弹窗打开；全部功能页图标也已恢复。最新 APK 的设备状态记录在忽略目录 `artifacts/android/build-report.json`。Android 启动图标使用 `src/app-resources/icons/android` 中的现有品牌图标，并在 manifest 中显式配置各密度。

同日通过独立标准调试基座定位时迹独立页空白：接口已返回记录，但当前 Vapor 原生运行中，条件 `template` 内的正文没有挂载；改为显式 `view` 容器后，已在小米 14 深色主题下看到日时间轴与真实记录，临时诊断代码已移除。手机、平板、桌面深浅色共 6 项 H5 时迹布局回归通过。云端打包当日免费额度已用完，现存 `modal-fixed` APK **不包含这次时迹容器修复**；标准调试基座验证不能代替新版 APK 验收。卡片视图、周/月切换和其余业务仍需原生逐项验证，详细边界见 `artifacts/android/time-render-fix-report.json`。

原生 `button` [不支持嵌套组件](https://doc.dcloud.net.cn/uni-app-x/component/button.html)。`prepare:app` 会解析 App 工程的模板，将含图标、插槽或其他子组件的按钮转换为 `AioNativeButton` 点击容器，保留 class/style、可访问名称和事件，显式阻止禁用/加载中的点击。不要直接对 App 使用的复杂按钮嵌套 `view` 作为修复；Web/微信源码与原生按钮的授权行为不受这一步转换影响。

原生接口也要按 App 签名处理：`onKeyboardHeightChange` 返回监听编号，销毁弹窗时用该编号调用 `offKeyboardHeightChange`；微信仍传原回调函数。当前 Android Vapor 的 SVG 图像解码器出现过 `unimplemented`，分类图标通过本地 UTS 插件栅格化为透明 PNG 并缓存，其他平台保留 SVG。生产时迹查询仍可能返回旧版完整 `{items,total}`，客户端兼容完整数据，但拒绝把不完整分页当作全天记录进行统计。

App 的 CommonJS 依赖（ZIP、SM4）在构建时转换为 ESM，动态 GBK 解码依赖内联到 Vapor 的 IIFE，保留原导入和密码库能力。App 网格、视口高度和按钮文字使用原生适配；Web/微信保留原样式。编译仍报告 `gap`、部分媒体查询、`aspect-ratio` 等原生 CSS 兼容警告，安装包目前用于设备验证，不能据此声称所有页面和功能已完成 App 验收。

Web 与小程序按官方机制仍使用 VDOM 运行；它们构建成功只能证明这两个目标的编译，不能代替 App Vapor 真机验证。

## 接口

| 方法 | 路径（相对于 `/api`） | 用途 |
| --- | --- | --- |
| POST | `/auth/login` | `{ username, password }`，读取 `data.accessToken` |
| GET | `/auth/wechat/mini/capabilities` | 小程序微信登录功能开关 |
| POST | `/auth/wechat/mini/login` | `{ loginCode }`，返回业务会话或临时票据 |
| POST | `/auth/wechat/mini/phone-login` | `{ loginTicket, phoneCode }`，注册或进入老账号绑定 |
| POST | `/auth/wechat/mini/bind` | 原账号 Token + `{ loginTicket, password }` |
| POST | `/auth/wechat/mini/password` | 当前 Token + `{ loginCode, newPassword }`，首次设密 |
| GET | `/user/info` | 获取当前用户，ID 保留为字符串 |
| POST | `/auth/logout` | 服务端注销 |
| PUT | `/users` | 修改昵称、个人简介和头像 |
| POST | `/file/upload` | 头像上传，multipart 字段 `file`、`bizType=avatar` |
| GET | `/userbinds/list` | 绑定列表，不请求凭证 |
| POST / PUT / DELETE | `/userbinds`、`/userbinds/{id}` | 新增、编辑和解除平台绑定 |
| GET | `/userbinds/douban/verify?accountId=...` | 验证豆瓣公开主页 |
| GET | `/dashboard/tasks`、`/dashboard/card/{type}` | 按账号获取统计卡片 |
| GET | `/timeTrackerCategory/list`、`/timeRecord/query?date=YYYY-MM-DD` | 分类和当天完整记录（数组，不分页），分钟为闭区间 |
| GET | `/timeRecord/queryByDateRange?startDate=...&endDate=...` | 周 / 月记录及上期对比 |
| GET | `/timeRecord/recommendNext?date=...`、`/timeRecord/{id}` | 推荐空闲时段与完整详情 |
| POST / PUT / DELETE | `/timeRecord`、`/timeRecord/{id}` | 新增、修改、删除 |
| GET | `/timeRecord/relateTypes`、`/read-record/page`、`/movie/page`、`/read-record/{id}`、`/movie/{id}` | 关联类型、阅读与观影分页选择及已关联卡片详情 |
| GET | `/userDictType/getByDictType?dictType=exercise_type` | 运动明细类型 |
| GET | `/quick-nav/my` | 已配置的快捷导航 |
| POST | `/quick-nav/my` | 保存完整快捷导航布局，`{ items: [{ menuId, enabled, sortOrder }] }` |
| GET | `/quick-nav/candidates`、`/menu/preferences` | 授权功能与菜单显示偏好，用于“全部”目录 |
| GET | `/taskDetails/watched`、`/thought/dashboard` | 关注待办和固定闪念 |
| GET | `/exerciseRecord/dashboardSummary?limit=7&lastDate=...` | 运动摘要及趋势，日期游标分页 |
| GET | `/github/recent-commits?perPage=10&page=1` | 绑定账号的最近提交 |

成功为 `{ code: 0, data: ... }`，业务错误读取 `message`。鉴权使用 `Authorization: Bearer <token>`；不依赖跨端 Cookie，也不尝试不存在的 refresh 接口。用户资料仅保留在内存，密码不会持久化。

## 结构

```text
src/
  App.uvue            全局主题与初始化
  main.ts            应用入口
  manifest.json       Vapor 与平台配置
  pages.json          页面路由
  pages/login/        登录
  pages/home/         首页
  pages/life/         功能目录、搜索与常用编辑
  pages/time/         日周月时间轴与兼容编辑入口
  pages/profile/      个人设置、账号绑定、通知与菜单锁
  pages/records/      生活记录及业务表单
  pages/tasks/        待办与目标
  pages/finance/      财务概览、账单、银行卡与导入
  pages/admin/        管理员入口与管理页面
  pages/personality/  MBTI、CBTI与外部测试
  uni_modules/        App本机安全随机数桥接
  services/           请求、响应契约和登录态
tests/                契约测试与 Web E2E
```

本仓库独立提交与推送，复用 [aio-life-server](https://github.com/lys1313013/aio-life-server)；工作区入口见 [aio-life](https://github.com/lys1313013/aio-life)。

选型和兼容性依据：[Vapor](https://doc.dcloud.net.cn/uni-app-x/app-vapor.html)、[manifest](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest.html)、[主题适配](https://doc.dcloud.net.cn/uni-app-x/api/theme-change.html)。

## 移动端时迹验证

时迹的接口与界面起止分钟都采用闭区间，例如 23:10–23:33 为 24 分钟；小时 / 分钟编辑会联动结束时间，快捷调整停在相邻记录边界。首页待记录时长为当前分钟减去最新记录的结束分钟再减一，没有记录时仅显示加号。

2026-09-30：纯逻辑 / 契约测试与 Web E2E 覆盖增删改、附属字段保留、推荐已满、加载与提交失败恢复、跨周期查询、下拉手势、首页快捷录入、时长联动及 390 / 768 / 1440px 深浅色。微信开发者工具已读取真实日 / 周记录；记录写入通过模拟接口回归，未向线上账号写入测试记录。最新构建与验证结果以本次交付说明为准。真机和 App Vapor 安装包仍未验证。

### 时迹精简编辑弹窗验证（2026-10-02）

- 实际 Web 已查：从菜单进入时迹并检查详情编辑及删除确认，保留分类、关联记录、运动明细及分钟闭区间契约。
- Mobile 已改：首页、时迹页与独立编辑入口统一采用精简表单，共用提交逻辑；运动 / 关联记录位于时间与时长之后，标题与描述在其下方；时迹编辑弹窗上下至少保留 40px（叠加安全区），长内容内部滚动，其他弹窗保持原间距；首页新增使用今天，时迹页新增使用所选日期。运动明细按“项目选择 / 数量 / 删除”紧凑同行排列，新增操作使用标题右侧加号；点击运动项目打开居中图标网格弹窗，显示当前选中项，点选回填，遮罩取消，保留数量和备注。
- Mobile 已看图：320 / 390 / 768 / 1440px 深浅主题新增表单，以及手机 / 平板 / 桌面编辑、分类与长运动表单截图。
- 交互已验证：时迹 E2E 40 项通过（35 项通过后，5 项在修正 picker 手势动画等待及宽屏原生日期输入断言后复测通过）；覆盖原生时间选择、遮罩关闭、失败保留、重复提交、冲突校验、关联字段保留及删除恢复。单元测试 127 项、H5 与微信小程序编译通过。
- 运动明细补充验证：新增 6 项手机 / 平板 / 桌面深浅主题用例通过，验证多条布局、追加继承、移除、数量修改及明细备注保留；相关 8 项原回归再次通过。最终 H5 与微信编译通过。
- 阅读 / 观影卡片补充验证：实际 Web 已检查阅读已关联封面卡片及选择弹窗；当前账号候选列表为空，候选网格以 Web 组件源码核对。Mobile 已实现封面卡片与选择网格，已查看 390 / 768 / 1440px 深浅主题截图；13 项新 E2E 通过，覆盖关联详情、鉴权封面、搜索、全部状态、分页、更换 / 清除及详情 / 列表 / 封面失败重试，另 7 项新增编辑与运动回归通过。127 项单元测试、间距校验、H5 / 微信编译通过。新增选择组件的微信编译文件合计约 13 KB，复用既有封面组件且未增加依赖；未做上传包体检查。
- 首页弹窗统一：移除首页旧布局开关并同步项目规范。6 项手机 / 平板 / 桌面深浅主题同记录对照回归通过，另 3 项首页新增关闭、时迹增改删、跨日编辑回归通过；手机原生调时与保存附属字段已验证，H5 / 微信编译通过。各尺寸以独立视口加载验收；连续从桌面缩至手机时曾观察到原生 picker 样式异常，运行时跨断点切换仍需另行排查。
- 运动选择弹窗：对照 Web 同款运动图标网格实现；6 项手机 / 平板 / 桌面深浅主题回归通过，已查看弹窗截图，覆盖选中状态、遮罩取消、更换项目、数量 / 备注保留及提交。H5 与微信编译通过。
- 附属记录位置与留白：25 项相关 E2E、127 项单元测试及 H5 / 微信编译通过；已检查手机 / 平板 / 桌面截图，验证运动与阅读 / 观影卡片位于时间之后、标题之前，长表单保留上下边距并可滚动保存。
- 验证边界：H5 使用模拟接口；未执行真实后端写入、微信 / App 真机或上传发布。截图位于本地忽略目录 `artifacts/time-compact/`。

### 时迹页面对齐验证（2026-10-01）

- 21 项纯逻辑 / API 契约测试通过，覆盖闭区间分钟、父子分类多选去重、跨年 / 闰月趋势、筛选日均分母。
- 时迹 Web E2E 共 32 项：26 项通过；6 项编辑布局用例在“无控制台错误”断言处失败，错误为共享主题初始化的 `setTabBarStyle:fail not TabBar page`、`setNavigationBarColor:fail page not found`。新增的 7 项视图 / 筛选 / 按钮 / 统计用例全部通过，保留失败结果，未屏蔽异常。
- 已检查 390 / 768 / 1440px 深浅色截图、时间轴比例与短记录、卡片分组、多选筛选、偏好恢复、新增 / 编辑 / 删除、失败恢复、趋势重试、原生底栏与浮动按钮间距。测试均使用模拟数据。
- Web、微信小程序构建通过；本次未做真实后端写入、微信真机或 App Vapor 真机验证。

复用新增按钮时放在页面根容器内、滚动容器外：

```vue
<FloatingActionButton label="新增时迹" :disabled="loading" @click="handleAdd" />
```

组件支持 `label`、`disabled`、`loading`、`bottom`、`right`；默认 56px、距页面右侧 / 底部 20px，页面应已扣除原生 tabBar 与安全区。

## 我

外观支持日间、夜间及跟随系统，选择保存在本机，页面、弹窗、下拉指示器和原生底栏统一切换。新增组件的深色样式使用简单 `*-dark` 类，通过 `services/theme.ts` 的 `themeClass` 绑定，避免系统深色媒体查询覆盖手动日间选择。

基本设置支持头像上传、昵称、个人简介修改，邮箱只读，与 Web 和现有后端保持一致。账号绑定支持 GitHub、LeetCode、CSDN、扇贝单词、豆瓣和微信读书的新增、编辑、解绑；编辑时平台固定，凭证不回显，留空保留原凭证。豆瓣可验证账号，微信读书新建必须填写 API Key。提交失败保留表单，解绑在原按钮旁确认。

`tests/e2e/profile.spec.js` 使用模拟接口验证保存与解绑失败重试、长 ID、凭证保留、登录过期及 390 / 768 / 1440px 下手动主题切换、刷新恢复和弹窗布局；不代表真实平台凭证联调、微信或 App 真机验证。

## 全部导航（2026-10-01）

“全部”目录采用内存与 `uni` 本地存储两层缓存（Web 使用 localStorage），保留旧目录供即时展示，成功更新后的 60 分钟内不重复请求。同一登录状态下，整页刷新或重启应用后复用本地目录，超过 60 分钟后台更新；下拉刷新强制重新请求并更新两层缓存；退出登录、切换 Token 或在系统设置清除缓存时清理。缓存仅保存登录指纹与目录，不额外保存 Token；存储异常时仍可使用内存和接口加载。

首页在同一页面实例内复用 1 分钟内的数据，短时间返回不重新请求整页；成功的新增、编辑、删除按业务区域标记失效，返回后只更新相关区域。后台更新保留已加载内容（包括空结果），失败提供局部重试；首页业务卡片返回时重新检查二级锁有效期，失效立即撤下旧内容。业务数据不写入持久化缓存。

保留四栏：首页 / 时迹 / 全部 / 我。待办、目标与全部已知业务菜单进入移动端页面；分组、名称及顺序随服务端菜单树配置同步，嵌套目录可逐级打开和返回，顶层叶子不附加组名，搜索直达授权叶子菜单。移动端例外：首页不进入“全部”目录，关于从“我”进入。分类及管理员配置同样遵循授权菜单树；服务端新增而尚未映射的自定义菜单保留网页版回退。菜单映射由 migration-routes 契约测试覆盖。

常用编辑使用现有 `/quick-nav/my`，上限依据当前前后端契约为 12（旧设计文档中的 8 已过时），新用户不填默认项。录入和提交失败保留草稿，加载失败不能覆盖服务端配置。跨页与跨账号请求忽略过期结果；不向网页版传递客户端 Token。

验证命令：`npm test`、`npx playwright test tests/e2e/life.spec.js`、`npm run build`、`npm run build:weixin`。E2E 使用明确模拟数据，覆盖 390 / 768 / 1440px 深浅色、功能搜索、分组、时迹内跳、网页版跳转、快捷项增删排序及保存失败、首页同步、空目录与下拉失败恢复；不代表真实后端写入、微信真机、App Vapor 或发布验证。


## 全功能迁移本地验收（2026-10-01）

已注册 48 个页面、15 个业务分包，菜单路径及历史别名契约通过。88 项契约测试、121 项 Web 模拟 E2E（单 worker，2.2 分钟，退出码 0）、Web 与微信构建通过。完整报告位于主仓库 `docs/mobile-migration/acceptance.md`，尚未完成的真实后端及微信/App 真机验收保留在 `docs/Mobile全功能迁移任务清单.md`。默认 E2E 使用一个 worker，避免本机多 Chrome worker 关闭阶段挂起；需要时显式传 `--workers`。

微信开发工具 2.01.2510290 已只读验证首页、“全部”目录、衣柜分包；ES2017 微信构建目标避免 IDE 二次 Babel 转换引用缺失 helper。App 工具链不匹配、签名包和真机未验，不能由上述结果替代。

### 图标维护

会员品牌图标统一保存在后端 `aio-life-server/src/main/resources/static/membership-icons/`，映射清单为 `membership-icons.json`，通过 `/api/membership/provider-icons/{key}` 加载，深色主题使用 `?dark=true`。移动端 `MembershipLogo.uvue` 在订阅卡片、订阅平台选择列表和「系统管理 → 会员平台」中复用，品牌 PNG 不重复打包到移动客户端。后台平台的 `icon_key` 需关联清单中的 key；缺失或加载失败时显示分类图标。新增 OpenCode Go 并补齐 AI 图标执行后端 `sql/2_ini_data/2026-10-05_membership_opencode_go.sql`；同时部署新版后端资源和客户端。


操作图标使用 Web 同款 Ant Design / Lucide 本地 SVG，通过 `AppIcon` 和 `MobileButton` 展示，支持深浅色；不要使用 emoji 或字符代替操作图标。纪念日的用户自选 emoji 与 Web 保持一致。新增图标后运行 `node scripts/sync-action-icons.mjs`，从相邻 Web 仓库已生成的图标集合提取资源；底栏图标同步使用 `node scripts/sync-action-icons.mjs --tabs`（需要本地 Chrome，CI 使用 Playwright Chromium）。生成的 `action-icons.json` 和底栏 PNG 随 mobile 仓库保存，正常构建不依赖 Web 仓库或在线图标服务。

### H5 触摸选择器兼容补丁

锁定的 DCloud `3.0.0-alpha-5030120260930001` 在手指恰好滑动整数格时遗漏选中索引通知，导致视觉已切换、确认后仍保留旧值；选择器关闭动画结束前卸载父弹窗或重新打开，也会触发过期清理。`npm run dev`、`npm run build` 和 `npm test` 会先执行 `scripts/patch-uni-h5-picker.cjs`，为官方 picker 补齐通知与生命周期检查；不改变原生端组件。补丁可重复执行，版本或源码变化会明确报错，升级 DCloud 时需重新验证后更新或移除。直接调用 `uni` 命令前也须执行此脚本。

本轮逐页从菜单点击、弹窗展开与图标检查的证据见主仓库 `docs/mobile-migration/page-audit.md`。截图仅使用模拟数据，最终归档在忽略目录 `artifacts/page-audit/`，避免被 Playwright 清理临时测试结果时删除。

### 统一间距

只修改 `src/styles/spacing.json` 中的数值，运行 `npm run spacing:generate` 同步 SCSS 变量及公共类；`npm run spacing:check` 用于检查生成物。开发与构建会自动生成，测试会检查漂移。页面样式使用 `@use '../../styles/spacing.scss'`（公共类）与 `@use '../../styles/spacing-tokens' as *`（变量），不复制数字。弹窗测量直接读取同一 JSON。

`MobilePage` 负责唯一一层页面边距；业务容器使用 `ui-page-body`，自有滚动页使用 `ui-page-inset`。表单并排使用 `compact stretch`，不与外层 gap 重复留白。完整规则见 `AGENTS.md` 的统一间距章节。

### 统一排版

`src/styles/typography.json` 是全客户端字号、字重、行高、字间距以及等宽字体的唯一配置；Canvas 海报也从同一配置读取。页面、表单、列表、弹窗、图表不再单独写数字。uni-app x 不继承父容器字号，`text`/输入控件必须直接应用角色样式；不要只在 `view` 上设字体。修改后执行 `npm run typography:generate`，`npm run typography:check` 会检查生成物漂移和源码中的硬编码；开发/构建自动生成，`npm test` 自动检查。

页面使用 `@use '../../styles/typography' as *;`，按用途引用完整组合，例如 `@include type-style('title');`、`@include type-style('body');`、`@include type-style('label');`。未设专用文字类的节点可显式使用 `ui-type-body` 等公共角色类，并在组件样式开头加入 `@include type-utilities('body');`，生成逻辑仍由公共样式维护。普通标题为 16px/500，正文与输入为 14px/400，表单标签为 13px/400；数值只在 JSON 中维护。`FormField` 的默认和 `soft` 外观使用相同排版，外观不再决定字号。

统计使用 `metric` 系列，纪念日大数字使用 `display`，密集时间轴/图表使用 `chart-label`、`chart-detail`、`timeline`，字符图标/emoji 使用 `glyph-*`、`emoji`；这些角色保留各自信息层级，不把所有文字缩成一样大。按钮点击区域与字号分离，44px 点击范围仍由统一间距配置管理。新增例外先定义通用语义角色，禁止按页面命名一套字号。`_typography-tokens.scss` 为生成物，不可手改。

### Web 扫码登录确认页

`pages/auth/web-login` 位于账号分包。微信扫码进入后，未登录用户先走现有微信登录/注册，完成后回到确认页；确认会重新取得微信 code 验证当前账号，全程不请求手机号。

上线时先部署后端接口，再上传发布包含该页面的小程序，最后开启后端 `AIO_LIFE_WECHAT_WEB_SCAN_ENABLED=true` 并部署 Web。正式版使用 `AIO_LIFE_WECHAT_WEB_SCAN_ENV_VERSION=release`。完整协议、测试边界和发布顺序见后端 `docs/微信小程序登录.md` 的 Web 扫码章节。

专项验证：`node --test tests/wechat-web-login.test.mjs tests/wechat-auth.test.mjs`、`node tests/wechat-ui/run.mjs`。后者仅在隔离测试工程中模拟微信，包含扫码新用户注册后的返回、确认/取消与三种宽度的深浅主题截图，不能替代真机扫码。

### App 授权 Web 扫码登录

在 Web 登录页选择“App 扫码登录”，然后在已登录的 App 或微信小程序打开“我 → 扫码登录 → 扫一扫”，核对账号、浏览器和四位核对码后确认。仅接受 AIO Life 登录协议二维码，不会打开任意扫码网址或向第三方发送 Token。拒绝、过期、换账号或离页后的旧请求不能继续授权。

页面与专属服务归入 `pages/scan-login` 分包。H5 不支持 `uni.scanCode`，隐藏入口；直接访问该页会提示使用 App / 小程序。Android / iOS 的 manifest 已登记 `uni-barcode-scanning`，需要用项目匹配的 HBuilderX 重新打包后验证摄像头权限及扫码；Web 模拟状态和微信构建不能代替 App 真机验收。

专项逻辑验证：`node --test tests/qr-login.test.mjs tests/qr-login-page.test.mjs`。完整提交前验证仍使用 `npm run test:commit`。服务端部署要求和接口约定见后端 README 的“已登录 App 扫码登录 Web”。
