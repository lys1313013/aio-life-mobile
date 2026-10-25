# AIO 安全随机数

仅在 App Android / iOS 条件编译中从插件根目录导入 `secureRandomHex(length)`，接收 1–4096 的整数字节数，返回长度为 `length * 2` 的十六进制字符串。参数无效返回空串；iOS 系统随机源失败也返回空串，Android 原生异常向调用方传播。密码库调用方会拒绝空串或格式异常结果，异常同样终止生成，不降级为伪随机数。Android 使用 `java.security.SecureRandom`，iOS 使用 `SecRandomCopyBytes`。不保存、打印或传输随机数。

遵循 [UTS 插件](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin.html) 和 [原生混编](https://doc.dcloud.net.cn/uni-app-x/plugin/uts-plugin-hybrid.html) 目录及导入方式。App 必须通过匹配版本 HBuilderX 编译；Web/微信构建不会验证 UTS 桥接。编译与真机状态见[App 开发与验证](../../../docs/App开发与验证.md)：其中记录了 2026-10-21 的 Android 本地 UTS 编译，iOS 原生联编与最终安装包仍需独立验证；历史结果不代表当前工作区已验证。

macOS源码校验可用 `swiftc src/uni_modules/aio-secure-random/utssdk/app-ios/AioSecureRandom.swift tests/native-random.swift -o /tmp/aio-random-check`，运行后删除临时二进制；不输出随机字节。此项验证不证明UTS桥接可用。
