# 微信读书书籍跳转

Android 使用原生 `Intent.ACTION_VIEW`，将目标限定为 `com.tencent.weread`，不依赖 HTML5 Plus。传入接口的字符串 `bookId`，不能使用 Web 阅读链接中的 hash。

- `openWereadBook(bookId)`：尝试打开 `weread://reading?bId={bookId}&style=1`；返回 false 表示参数无效、没有 Activity、未安装或启动抛出异常。
- `openWereadWeb(url)`：使用系统打开微信读书 HTTPS 地址，拒绝其他域名及带身份信息的 URL。
- 返回 true 仅表示系统接受启动请求；系统权限提示、微信读书登录及书籍权限仍由目标应用处理。页面保留手动网页版入口，不使用定时强制跳转。

协议参考：[微信读书官方页面脚本](https://weread-1258476243.file.myqcloud.com/web/book-detail/127df43.js)。这是官方页面当前使用的协议，并非稳定的第三方开放接口承诺，升级微信读书时需真机回归。

本插件仅用于 Android。微信小程序无法调用此原生能力；要跳转微信读书小程序，需要另行确认其真实目标标识和页面路径，不能用网页地址代替。

`tests/weread-links.test.mjs` 覆盖业务链接、页面分发及原生调用的模拟边界；不替代 UTS 编译、最终 APK 安装或真机点击验收。

2026-10-04 使用 HBuilderX 5.31.2026093020-alpha 本地编译并导出 Android 发行资源成功。在小米 14 的同版本 Vapor 调试基座中，点击阅读排行的《局外人》已进入微信读书原生阅读页；返回后点击网页按钮，只启动系统浏览器并传入 `/web/reader/` 地址。手机浏览器中的最终展示由微信读书站点控制，本次重定向到了站点首页。

验证中修复了 Android 本地化日期造成统计参数 `NaN`，以及回退按钮在组件事件上使用 `.stop` 导致报错、误触发整行的问题。6 项专项测试通过。本次未生成独立 APK：官方离线 SDK 下载页当前提供 5.26，与项目的 5.31 不匹配。调试基座验证不代表最终 APK 验收。详细日志与截图保存在 Git 忽略的 `artifacts/android/weread-*` 中。
