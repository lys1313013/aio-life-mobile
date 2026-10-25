# iOS / Android 开发与验证

当前工具链为 DCloud 5.32 Alpha 对应 npm 版本；下文 5.31 的云包与真机结果是历史记录，不能作为 5.32 的通过证明。命令从移动端仓库根目录执行。

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

项目 npm 编译器统一固定为 **5.32 Alpha 对应版本 `3.0.0-alpha-5030220261016001`**；App 需要匹配的 HBuilderX 5.32 Alpha。2026-10-21 本机已安装 HBuilderX `5.32.2026101609-alpha`（Apple Silicon），官方 Vapor 基座 `5.32.2026101614.0312` 的 55 个 arm64 原生库通过 C++ 符号检查。`prepare:app` 校验匹配版本及原生库 SHA-256，不再注入旧版云包运行库补丁；本次仅验证本地编译，云打包 APK 与真机结果仍需独立验证。页面使用组合式 API，`.ts` 中使用 JS/TS 业务逻辑；浏览器专属能力（如打开网页、DOM 下载、鼠标事件和腾讯 GL 地图）通过 `WEB` 条件编译隔离；App / 小程序使用相应平台适配，公共纯逻辑不依赖 `window` 或 `document`。统计折线图和柱状图统一使用 `AioChart.uvue`，内部由 ECharts 6.1.0 绘制；页面只提供数据、单位和交互选项。Canvas 获取、尺寸变化与触摸处理集中在 `ChartCanvas.uvue`，深浅主题、坐标轴和数值格式统一管理。微信图表引擎由构建插件按需裁剪后放入 `chart-runtime` 共享分包，通过 `require.async` 加载；加载失败可重试，不静态进入主包。该分包登记的空 `bootstrap` 页面仅满足微信分包规则，没有业务导航入口。Web 和 App 使用同一套 ECharts 配置与 Canvas 适配。该版本属于 Alpha 通道，升级编译器时须重新执行跨端验证。2026-10-04 本机已安装 HBuilderX 5.31 Alpha（保留原 5.26 正式版），Android 原生编译和云打包通过，iOS App 资源编译通过。未安装完整 Xcode，未生成签名 IPA；资源编译不能代替 iOS 原生联编和真机验证。

执行 `npm run prepare:app` 生成 `artifacts/android/AIO-Life-App`，再用匹配版本的 HBuilderX 打开这个工程。该步骤复制当前源码、保留本地 DCloud AppID，并提供 App 专用依赖转换和生产 API 配置；生成物全部被 Git 忽略。首次在生成工程的 manifest 可视化界面获取自己的 DCloud AppID，或通过本地环境变量 `AIO_DCLOUD_APP_ID` 配置，再选择「发行 → 原生 App 云打包」。Android 可使用云端证书；iOS 需自己的 Bundle ID、Apple 签名证书和描述文件。不要提交证书、私钥或真实 AppID；源码 manifest 保持空 AppID。

生活足迹使用的腾讯原生地图还需要平台 SDK Key：在运行 `prepare:app` 前设置 `AIO_TENCENT_MAP_ANDROID_KEY` / `AIO_TENCENT_MAP_IOS_KEY`，或保留忽略工程 manifest 中已有的 Key；脚本会沿用这些值，源码 Key 保持空值。Key 的平台绑定与自定义基座要求见[功能与接口](功能与接口.md)的生活足迹说明。

2026-10-04 小米 14 真机定位到 5.31 云包的 C++ 运行库不匹配：`libuniappx.so` 引用了云包中 `libc++_shared.so` 缺失的 `__from_chars_floating_point` 符号，导致页面初始化前黑屏。当时通过从官方 Vapor 基座提取匹配的 arm64 C++ 库、注入忽略工程的 UTS `libs` 目录修复。5.32 本地编译已取消这一注入，准备工程时会清理旧覆盖库，并校验官方基座；云包如再出现问题，应先检查实际 APK 的符号依赖，不能直接复用 5.31 补丁。默认 HBuilderX 路径为 `/Applications/HBuilderX-Alpha.app/Contents/HBuilderX`，可用 `AIO_HBUILDERX_ROOT` 指定；升级 HBuilderX 后必须重新验证，不能继续套用旧运行库。二进制不进入源码仓库。

2026-10-21 本地编译验证使用 `cli launch app-android --compile true`，57 个页面编译通过，三个 UTS 插件（安全随机数、微信读书跳转、原生图标）均生成 DEX/JAR。本地标准基座不自动解析图标插件的 Maven 依赖，验证工程临时使用 Maven Central 的 `com.caverock:androidsvg:1.4` JAR（校验官方 SHA-1），并仅在该忽略工程中移除相同 Maven 声明以避免重复类；源码依赖配置保留。再次执行 `prepare:app` 会还原源码配置，本地标准基座编译需重新准备该依赖。`cli launch app-ios --iosTarget simulator --compile true` 的页面资源编译通过，但明确跳过了 UTS 原生编译：本机没有完整 Xcode / iOS SDK。未生成签名 APK/IPA，未连接模拟器或真机，也未执行云打包、上传或发布。

HBuilderX 5.32 本机 GUI 导入工程时出现界面无响应；本次通过 `QT_QPA_PLATFORM=offscreen` 启动已安装的 HBuilderX，再使用其 CLI 完成编译。日志及本地验证报告保存在忽略目录 `artifacts/uni-5.32-upgrade/app/`。


APK 下载后执行 `node scripts/check-android-runtime.mjs <apk路径>` 检查实际原生库的 C++ 导入符号，再做签名校验、覆盖安装和冷启动检查。2026-10-04 小米 14 已验证登录、首页统计及快捷导航图标、首页时迹图表与记录、记录编辑弹窗打开；全部功能页图标也已恢复。最新 APK 的设备状态记录在忽略目录 `artifacts/android/build-report.json`。Android 启动图标使用 `src/app-resources/icons/android` 中的现有品牌图标，并在 manifest 中显式配置各密度。

同日通过独立标准调试基座定位时迹独立页空白：接口已返回记录，但当前 Vapor 原生运行中，条件 `template` 内的正文没有挂载；改为显式 `view` 容器后，已在小米 14 深色主题下看到日时间轴与真实记录，临时诊断代码已移除。手机、平板、桌面深浅色共 6 项 H5 时迹布局回归通过。云端打包当日免费额度已用完，现存 `modal-fixed` APK **不包含这次时迹容器修复**；标准调试基座验证不能代替新版 APK 验收。卡片视图、周/月切换和其余业务仍需原生逐项验证，详细边界见 `artifacts/android/time-render-fix-report.json`。

原生 `button` [不支持嵌套组件](https://doc.dcloud.net.cn/uni-app-x/component/button.html)。`prepare:app` 会解析 App 工程的模板，将含图标、插槽或其他子组件的按钮转换为 `AioNativeButton` 点击容器，保留 class/style、可访问名称和事件，显式阻止禁用/加载中的点击。不要直接对 App 使用的复杂按钮嵌套 `view` 作为修复；Web/微信源码与原生按钮的授权行为不受这一步转换影响。

原生接口也要按 App 签名处理：`onKeyboardHeightChange` 返回监听编号，销毁弹窗时用该编号调用 `offKeyboardHeightChange`；微信仍传原回调函数。当前 Android Vapor 的 SVG 图像解码器出现过 `unimplemented`，分类图标通过本地 UTS 插件栅格化为透明 PNG 并缓存，其他平台保留 SVG。生产时迹查询仍可能返回旧版完整 `{items,total}`，客户端兼容完整数据，但拒绝把不完整分页当作全天记录进行统计。

App 的 CommonJS 依赖（ZIP、SM4）在构建时转换为 ESM，动态 GBK 解码依赖内联到 Vapor 的 IIFE，保留原导入和密码库能力。App 网格、视口高度和按钮文字使用原生适配；Web/微信保留原样式。编译仍报告 `gap`、部分媒体查询、`aspect-ratio` 等原生 CSS 兼容警告，安装包目前用于设备验证，不能据此声称所有页面和功能已完成 App 验收。

Web 与小程序按官方机制仍使用 VDOM 运行；它们构建成功只能证明这两个目标的编译，不能代替 App Vapor 真机验证。
