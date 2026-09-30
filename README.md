# AIO Life Mobile

AIO Life 的独立跨端客户端，采用 **uni-app x + Vapor 蒸汽模式**。提供账号密码登录及首页、时迹、我的三栏，连接现有 Spring Boot 后端。

## 已实现

- 账号密码登录、输入校验、提交 loading 与错误提示。
- 微信小程序支持微信身份登录、手机号授权注册、原账号密码验证后绑定，以及微信账号首次设置密码；功能由后端开关控制，Web / App 保留账号密码入口。
- 保存 Token，重新打开后恢复登录；HTTP 401 清理会话并返回登录页。
- 原生底部导航：首页 / 时迹 / 我的，图标选中态、深浅色及底部安全区；登录页隐藏导航。
- 时迹支持日 / 周 / 月查询、分类（含子分类）筛选、累计时长、记录日均、上期对比和分类时长分布。
- 新增 / 编辑 / 删除时迹：服务端推荐时段、日期切换、分类搜索、标题与描述、起止时间各自 −1 / +1 / −30 / +30 和长按调整、小时 / 分钟时长联动、运动明细、阅读 / 观影关联选择。保存前检查当天时间冲突，完整详情失败时禁止提交，更新保留附属字段。
- 首页时迹卡片右上角保留“距上次记录时长 ＋”入口，每分钟更新；最近记录可点按编辑。首页快捷录入延续 Web 的昨日剩余时间超过一小时优先补录逻辑。
- 首页 / 时迹 / 我的统一下拉刷新，移除导航栏与卡片常驻刷新按钮，失败可局部重试；我的提供账户资料与退出确认。
- 首页按现有 `/analytics` 仪表盘布局：统计卡片、时迹环图与时间轴、快捷导航、关注待办、固定闪念、运动趋势、GitHub 最近提交。
- 首页使用真实接口；卡片独立 loading / 重试，未绑定或无数据的可选模块隐藏，运动与提交支持分页加载。隐藏闪念不会显示原文。
- 手机 / 平板 / 桌面分别采用单列 / 双列 / 三列内容卡片，顶部统计卡片采用双列 / 五列；保留系统深浅色。
- 退出前在按钮旁确认；请求失败时仍清理本机登录状态，并提示服务端注销未完成。
- 浅色 / 深色跟随系统，页面宽度适配手机、平板与桌面。

当前范围为登录、首页概览、时迹记录管理和个人资料；时迹使用移动端列表与独立编辑页，未迁移 Web 的拖拽时间轴、分类管理、全部统计图或快捷导航配置等页面。快捷导航在 Web 打开原网页版；App / 小程序提示复制网页版链接，不传递本机 Token，网页版需单独登录。未接入 App 微信 OAuth、短信登录、通知或离线同步。

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
node tests/wechat-ui/run.mjs # 独立测试副本模拟小程序登录分支，不调用真实微信
```

本机 E2E 使用已安装的 Google Chrome。CI 使用 `npx playwright install --with-deps chromium` 安装浏览器。测试截图、报告和 trace 均在 Git 忽略目录中。

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

项目 npm 编译器统一固定为 **5.31 Alpha 对应版本 `3.0.0-alpha-5030120260930001`**，建议使用同版本 HBuilderX 5.31 Alpha 导入根目录的 CLI 项目进行 App 调试。页面使用组合式 API，`.ts` 中使用 JS/TS 业务逻辑；只有打开网页版链接的 `window.open` 放在 `WEB` 条件编译内，App / 小程序采用 `uni.*`。图表使用基础 `view`，未引入 Web ECharts。该版本属于 Alpha 通道，升级编译器时须重新执行跨端验证。本次机器预装的 HBuilderX 4.87 未升级，不能用于当前 Vapor App 验证。

App 运行 / 打包需配置项目自己的 DCloud AppID、设备或模拟器，以及相应签名配置。不要使用示例项目 AppID，也不要提交证书和私钥。仓库保留空 AppID，未生成安装包。

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
| GET | `/dashboard/tasks`、`/dashboard/card/{type}` | 按账号获取统计卡片 |
| GET | `/timeTrackerCategory/list`、`/timeRecord/query?date=YYYY-MM-DD&pageSize=100&page=1` | 分类和当天完整分页记录，分钟为闭区间 |
| GET | `/timeRecord/queryByDateRange?startDate=...&endDate=...` | 周 / 月记录及上期对比 |
| GET | `/timeRecord/recommendNext?date=...`、`/timeRecord/{id}` | 推荐空闲时段与完整详情 |
| POST / PUT / DELETE | `/timeRecord`、`/timeRecord/{id}` | 新增、修改、删除 |
| GET | `/timeRecord/relateTypes`、`/read-record/page`、`/movie/page` | 关联类型、阅读与观影分页选择 |
| GET | `/userDictType/getByDictType?dictType=exercise_type` | 运动明细类型 |
| GET | `/quick-nav/my` | 已配置的快捷导航 |
| GET | `/taskDetails/watched`、`/thought/dashboard` | 关注待办和固定闪念 |
| GET | `/exerciseRecord/dashboardSummary?limit=7&lastDate=...` | 运动摘要及趋势，日期游标分页 |
| GET | `/github/recent-commits?perPage=10&page=1` | 绑定账号的最近提交 |

成功为 `{ rscode: "0", data: ... }`，业务错误读取 `result`。鉴权使用 `Authorization: Bearer <token>`；不依赖跨端 Cookie，也不尝试不存在的 refresh 接口。用户资料仅保留在内存，密码不会持久化。

## 结构

```text
src/
  App.uvue            全局主题与初始化
  main.ts            应用入口
  manifest.json       Vapor 与平台配置
  pages.json          页面路由
  pages/login/        登录
  pages/home/         首页
  pages/time/         日周月记录与时迹编辑
  pages/profile/      账户资料与退出
  services/           请求、响应契约和登录态
tests/                契约测试与 Web E2E
```

本仓库独立提交与推送，复用 [aio-life-server](https://github.com/lys1313013/aio-life-server)；工作区入口见 [aio-life](https://github.com/lys1313013/aio-life)。

选型和兼容性依据：[Vapor](https://doc.dcloud.net.cn/uni-app-x/app-vapor.html)、[manifest](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest.html)、[主题适配](https://doc.dcloud.net.cn/uni-app-x/api/theme-change.html)。

## 移动端时迹验证

时迹的接口与界面起止分钟都采用闭区间，例如 23:10–23:33 为 24 分钟；小时 / 分钟编辑会联动结束时间，快捷调整停在相邻记录边界。首页待记录时长为当前分钟减去最新记录的结束分钟再减一，没有记录时仅显示加号。

2026-09-30：纯逻辑 / 契约测试与 Web E2E 覆盖增删改、附属字段保留、推荐已满、加载与提交失败恢复、跨周期查询、下拉手势、首页快捷录入、时长联动及 390 / 768 / 1440px 深浅色。微信开发者工具已读取真实日 / 周记录；记录写入通过模拟接口回归，未向线上账号写入测试记录。最新构建与验证结果以本次交付说明为准。真机和 App Vapor 安装包仍未验证。
