import Foundation

@main struct SecureRandomSourceCheck {
    static func main() {
        for length in [1, 32, 256, 4096] {
            let value = AioSecureRandom.hex(length)
            precondition(value.count == length * 2)
            precondition(value.allSatisfy { $0.isHexDigit })
        }
        for length in [-1, 0, 4097] { precondition(AioSecureRandom.hex(length).isEmpty) }
        print("Native SecureRandom source checks passed; UTS/device integration is not covered")
    }
}
