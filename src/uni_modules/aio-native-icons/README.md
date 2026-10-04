# Android 图标渲染

Android Vapor 5.31 在真机上不能通过 `image` 解码本项目的 SVG 图标（包括 data URI 和本地 `.svg` 文件）。插件使用框架已有的 `com.caverock:androidsvg:1.4`，将 `catalog.generated.json` 中的本地 SVG 渲染成透明 PNG data URI。

业务图形和动态颜色不变；JS 层按 SVG 内容与像素尺寸缓存，最多 256 项。原生位图用后释放，不访问网络、用户文件或存储凭据。Web、微信和 iOS 不引入该 Android 插件，继续使用现有 SVG 路径。

依赖使用 AndroidSVG 的 JAR 坐标，不能再添加 `androidsvg-aar`，否则与框架产生重复类。AndroidSVG 使用 Apache-2.0，说明见 https://bigbadaboom.github.io/androidsvg/ 。

编译成功不等于图像正确：修改后需在 Android 真机核对常规图标、双色图标和深浅主题，并检查渲染错误日志。
