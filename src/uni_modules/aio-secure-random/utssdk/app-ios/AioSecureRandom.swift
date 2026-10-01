import Foundation
import Security

public final class AioSecureRandom {
    public static func hex(_ length: Int) -> String {
        guard length > 0 && length <= 4096 else { return "" }
        var bytes = [UInt8](repeating: 0, count: length)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, length, buffer.baseAddress!)
        }
        guard status == errSecSuccess else { return "" }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }
}
