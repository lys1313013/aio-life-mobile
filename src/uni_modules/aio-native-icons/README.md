# Android 图标渲染

历史 Android Vapor 5.31 真机验证发现，无法通过 `image` 解码本项目的 SVG 图标（包括 data URI 和本地 `.svg` 文件）。插件通过 `utssdk/app-android/config.json` 声明 `com.caverock:androidsvg:1.4` 依赖，将 `catalog.generated.json` 中的本地 SVG 渲染成透明 PNG data URI。

业务图形和动态颜色不变；JS 层按 SVG 内容与像素尺寸缓存，最多 256 项。原生位图用后释放，不访问网络、用户文件或存储凭据。Web、微信和 iOS 不引入该 Android 插件，继续使用现有 SVG 路径。

依赖使用 AndroidSVG 的 JAR 坐标，不能再添加 `androidsvg-aar`，否则可能引入重复类。使用本地标准调试基座时，依赖准备方式见[App 开发与验证](../../../docs/App开发与验证.md)；不能假定所有编译路径都已自动提供该依赖。AndroidSVG 使用 Apache-2.0，说明见 https://bigbadaboom.github.io/androidsvg/ 。

编译成功不等于图像正确：修改后需在 Android 真机核对常规图标、双色图标和深浅主题，并检查渲染错误日志。
