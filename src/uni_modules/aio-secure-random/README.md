# AIO 安全随机数

仅在 App Android / iOS 条件编译中从插件根目录导入 `secureRandomHex(length)`，返回 `length` 字节的十六进制；参数无效或系统失败返回空串，由调用方拒绝生成。Android 使用 `java.security.SecureRandom`，iOS 使用 `SecRandomCopyBytes`。不保存、打印或传输随机数。

遵循 [UTS 插件](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin.html) 和 [原生混编](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin-hybrid.html) 目录及导入方式。App 必须通过匹配版本 HBuilderX 编译；Web/微信构建不会验证 UTS 桥接。本次仅能在 macOS 校验 Swift 系统实现，App Vapor Android/iOS 联编和真机待验证。

macOS源码校验可用 `swiftc src/uni_modules/aio-secure-random/utssdk/app-ios/AioSecureRandom.swift tests/native-random.swift -o /tmp/aio-random-check`，运行后删除临时二进制；不输出随机字节。此项验证不证明UTS桥接可用。
