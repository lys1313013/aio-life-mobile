# AIO Life Mobile

- 默认中文沟通。本项目是独立 Git 仓库，使用 uni-app x **Vapor**，禁止为了编译通过改成普通 uni-app 或关闭 Vapor。
- 页面使用 `.uvue` 和组合式 API。`src/manifest.json` 保留 `uni-app-x.vapor: true`，样式隔离策略为 2。
- 仅使用简单类选择器、跨端内置组件和 `uni.*` API；平台差异通过条件编译隔离。纯逻辑不依赖 `window`、`document`。
- API 成功码为字符串 `'0'`，错误信息字段是 `result`，ID 始终保留字符串，鉴权为 Bearer Token。
- 凭据、Token、证书、真实用户截图不能进入 Git。测试只能使用明确的模拟数据，不得在生产页面提供自动登录或模拟登录入口。
- 接口有 loading，错误可重试。退出确认靠近按钮；手机、平板、桌面及深浅色都需检查。
- 验证命令见 README。区分 Web E2E、微信编译、微信真机、App Vapor 真机和发布，未验证不能声称已通过。
- DCloud 包保持一致版本；本仓库 npm lockfile 是依赖锁定依据。
