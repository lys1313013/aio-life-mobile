# 小程序与 Android 平台分支审计

审计日期：2026-10-29。范围为当前 `src` 下 `.uvue`、`.ts`、`.uts`、`.scss`、`.json` 的条件编译，以及相关平台调用和测试契约。以开始审计时的工作区为基线，保留已有首页、滚动布局和圆环改动；不修改 Vapor 配置，不提交代码。

## 已统一的行为与适配归属

| 范围 | 调整后入口 | 业务行为 |
| --- | --- | --- |
| GitHub / LeetCode | `src/pages/coding/services/coding.ts` | 三端均通过当前服务端接口读取绑定账号数据；不在客户端索取平台 Token 或分别拼接外部 GraphQL 请求。仓库分页、详情与统计共用契约。 |
| 微信读书首页和列表 | `src/services/weread-navigation.ts` | 共用唤起、网页链接校验及浏览器窗口管理。唤起失败保留页面并显示错误，提供显式网页版入口；保留账号变化、离页后的回调保护。 |
| 头像选择 | `src/components/AvatarPickerButton.uvue` | 平台只负责选取图片，页面统一上传、保存和错误处理。微信 chooseAvatar 与 Android chooseImage 转换成相同事件。 |
| 文件预览、保存和日志导出 | `src/pages/admin/services/file-output.ts` | 业务层统一鉴权、响应校验、文件名、账号切换保护。适配层负责 Blob / 文件缓存、分享或保存及清理。Android 日志导出由两次下载请求改为一次请求。只被管理分包使用，保留在该分包。 |
| 通用外链 | `src/services/external-link.ts`、`src/uni_modules/aio-external-link` | 编程、观影等入口共用；Android 使用原生 Intent 打开 HTTPS 网页并反馈失败。小程序保留复制链接能力。 |
| 四个 tab 页面 | `src/components/TabPage.uvue` | 页面统一使用同一个容器。微信页面内底栏、H5 / App 原生底栏的差异由容器内部处理。 |
| 网格、换行、按钮边框等 | `src/styles/platform.scss` | 重复条件样式收拢到 Sass mixin。保留原有列宽、间距、布局声明；尺寸继续由现有 App 布局服务与 spacing 配置提供。 |
| 多行文本 | `platform.scss` 与 `text` 的 `max-lines` 属性 | 修复缺失的原生截断属性和无效的 `lines` / `max-lines` CSS；备忘录两端都显示最多 10 行，其余笔记为 8 行。展开摘要共用状态。 |
| 首页圆环 | `src/services/canvas-surface.ts` | 绘制使用逻辑尺寸，App backing store 由原生布局持有。目标进度的图片、Canvas 和可访问文本统一限制在 0–100；图形业务仍保留在首页组件内。 |

服务端契约核对来源：相邻服务端仓库的 `CodingPlatformController`、`CodingPlatformService`。GitHub 日历仍保留其 GraphQL envelope，LeetCode 使用服务端返回的 inner data，相关 E2E fixture 同步调整。没有修改服务端代码或数据结构。

## 保留的必要分支

- 微信登录、订阅通知、隐私合同、微信身份注销和扫码授权：属于平台提供的身份与权限能力，继续通过现有认证服务和对应入口展示。
- `PageHeader`、`AdaptiveModal`、`ConfirmAction` 等组件：胶囊、安全区、键盘回调、root-portal 和返回键拦截，保留在对应公共组件中。
- `ChartCanvas`、首页圆环、`FootprintMap`、图标与海报：保留 Canvas / 图片 / 地图 SDK / 原生渲染适配；同一图形的数据计算与点击业务不另起一套。分包专属图形不提升到公共主包。
- Web 鼠标拖动、页面可见性和可访问标签补充：触屏仍使用共同手势，Web 增加桌面输入支持。首页排序与银行卡排序保留其业务组件内的事件和定位适配。
- App 的 flex 列宽、文本继承限制，Web / 微信的 media query、伪元素和焦点样式：重复能力已抽取，页面特有几何约束仍与页面布局放在一起。
- 文件选取、上传、下载、主题与窗口尺寸监听：已有公共服务继续承担平台能力差异。

iOS 不属于本次验收范围，已有 iOS 外链 `plus` 调用未被视为已修复或已支持。Android 已隔离到新增 UTS 插件。

## 可复现的分支清单

执行：

```sh
node scripts/audit-platform-branches.mjs
```

输出位于被 Git 忽略的 `artifacts/platform-audit/branches.json` 和 `branches.txt`，包含文件、行号、区域和条件。脚本不读取项目私有配置。

按同一源码扩展名口径，本次条件块从 137 个文件 / 589 处变为 111 个文件 / 343 处，减少 246 处。统计包括 H5 条件块，不是仅计算微信与 Android 的差异；数量下降不代表原生验收通过，也不要求把所有条件块清零。

## 验证证据与边界

- 49 个专项单元测试通过：编程接口契约、读书入口、文件与导出、头像、tab、Canvas 和 Android 外链模拟适配；原生 API 使用替身，不代表设备执行结果。
- 按 DCloud 实际条件预处理及 Sass 读取方式，检查 73 个受影响已有组件在 H5、微信、App 三种条件下的 219 份样式；均可编译。声明变化为文本截断修复与头像样式迁移，未发现额外网格、尺寸和间距变化。
- 当前源码 H5 构建及专项 E2E：编程与活动 6 组（390 / 768 / 1440，light / dark）通过；编程菜单 390 light、首页圆环 390 light 两项也通过，共 9 个用例。初次编程与活动用例因旧 fixture 写死 5180 端口而失败，改为匹配当前 API 地址后六组通过，没有增加 retries 或删减断言。
- 实际查看了手机、平板、桌面及深浅色的 GitHub、CSDN、LeetCode、活动代表性截图。此项是模拟数据 H5 检查，不是所有受影响页面的完整视觉验收。
- `spacing:check`、`typography:check`、`e2e:check` 与差异空白检查通过。
- 运行中的 Web 已查看首页、目标列表、编辑弹窗及删除确认（未确认删除）；其余业务本次主要依据源码及契约核查，未声称逐菜单完成 Web 对照。
- 尚未运行完整 `test:commit`、微信构建与官方包体测量、新 UTS 插件的 Android 编译及真机验收。按照仓库规范，留待提交前对最终代码统一验证；微信头像专项模拟、全量受影响页面视觉与 Web 对照也需补齐。
- 没有上传、体验版、审核或正式发布操作。

日志为 `artifacts/platform-audit/{targeted,output-avatar,adapters,style-check,e2e,e2e-coding-polish,static-checks}.log`；E2E 截图在 `test-results/`。这些输出不是固定包体基线或发布证据。
