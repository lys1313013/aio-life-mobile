# AIO Life Mobile

AIO Life 的独立跨端客户端，采用 **uni-app x + Vapor 蒸汽模式**。首版提供账号密码登录与首页，连接现有 Spring Boot 后端。

## 已实现

- 账号密码登录、输入校验、提交 loading 与错误提示。
- 保存 Token，重新打开后恢复登录；HTTP 401 清理会话并返回登录页。
- 首页展示本地日期、问候语和服务端返回的用户信息，支持刷新与失败重试。
- 退出前在按钮旁确认；请求失败时仍清理本机登录状态，并提示服务端注销未完成。
- 浅色 / 深色跟随系统，页面宽度适配手机、平板与桌面。

未接入微信授权登录、注册、业务记录、通知或离线同步。

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
```

本机 E2E 使用已安装的 Google Chrome。CI 使用 `npx playwright install --with-deps chromium` 安装浏览器。测试截图、报告和 trace 均在 Git 忽略目录中。

本次验证（2026-09-30）：真实本地后端账号登录、首页读取用户资料和刷新恢复登录已通过；4 项契约测试、10 项 Web E2E（包含 390 / 768 / 1440px 深浅色）已通过。微信小程序仅验证构建，未验证开发者工具或真机。iOS / Android 未构建安装包、未做 Vapor 真机测试。

### 微信小程序

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

项目 npm 编译器统一固定为 **5.31 Alpha 对应版本 `3.0.0-alpha-5030120260930001`**，建议使用同版本 HBuilderX 5.31 Alpha 导入根目录的 CLI 项目进行 App 调试。页面使用组合式 API，`.ts` 中使用 JS/TS 业务逻辑，未依赖浏览器对象。该版本属于 Alpha 通道，升级编译器时须重新执行跨端验证。本次机器预装的 HBuilderX 4.87 未升级，不能用于当前 Vapor App 验证。

App 运行 / 打包需配置项目自己的 DCloud AppID、设备或模拟器，以及相应签名配置。不要使用示例项目 AppID，也不要提交证书和私钥。仓库保留空 AppID，未生成安装包。

Web 与小程序按官方机制仍使用 VDOM 运行；它们构建成功只能证明这两个目标的编译，不能代替 App Vapor 真机验证。

## 接口

| 方法 | 路径（相对于 `/api`） | 用途 |
| --- | --- | --- |
| POST | `/auth/login` | `{ username, password }`，读取 `data.accessToken` |
| GET | `/user/info` | 获取当前用户，ID 保留为字符串 |
| POST | `/auth/logout` | 服务端注销 |

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
  services/           请求、响应契约和登录态
tests/                契约测试与 Web E2E
```

本仓库独立提交与推送，复用 [aio-life-server](https://github.com/lys1313013/aio-life-server)；工作区入口见 [aio-life](https://github.com/lys1313013/aio-life)。

选型和兼容性依据：[Vapor](https://doc.dcloud.net.cn/uni-app-x/app-vapor.html)、[manifest](https://doc.dcloud.net.cn/uni-app-x/collocation/manifest.html)、[主题适配](https://doc.dcloud.net.cn/uni-app-x/api/theme-change.html)。
