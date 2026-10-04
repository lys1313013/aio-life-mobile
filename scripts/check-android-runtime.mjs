import { execFileSync } from 'node:child_process';

// Inspect actual ELF dynamic symbols, not a version string or a successful ZIP/signature check.
function symbols(bytes) {
  if (bytes.readUInt32BE(0) !== 0x7f454c46 || bytes[4] !== 2 || bytes[5] !== 1) {
    throw new Error('Expected a little-endian ELF64 library');
  }
  const sectionOffset = Number(bytes.readBigUInt64LE(40));
  const sectionSize = bytes.readUInt16LE(58);
  const sections = Array.from({ length: bytes.readUInt16LE(60) }, (_, i) => {
    const at = sectionOffset + i * sectionSize;
    return {
      type: bytes.readUInt32LE(at + 4),
      offset: Number(bytes.readBigUInt64LE(at + 24)),
      size: Number(bytes.readBigUInt64LE(at + 32)),
      link: bytes.readUInt32LE(at + 40),
      entrySize: Number(bytes.readBigUInt64LE(at + 56)),
    };
  });
  const result = [];
  for (const section of sections.filter(s => s.type === 11)) {
    const strings = sections[section.link];
    for (let at = section.offset; at < section.offset + section.size; at += section.entrySize) {
      const start = strings.offset + bytes.readUInt32LE(at);
      const name = bytes.toString('utf8', start, bytes.indexOf(0, start));
      if (name && bytes[at + 4] >> 4 !== 0) {
        result.push({ name, defined: bytes.readUInt16LE(at + 6) !== 0, weak: bytes[at + 4] >> 4 === 2 });
      }
    }
  }
  return result;
}

const apk = process.argv[2];
if (!apk) throw new Error('Usage: node scripts/check-android-runtime.mjs <arm64.apk>');
const entries = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8' }).trim().split('\n');
const libraries = entries.filter(name => /^lib\/arm64-v8a\/[^/]+\.so$/.test(name));
if (!libraries.some(name => name.endsWith('/libuniappx.so'))) throw new Error('Vapor runtime missing');
if (!libraries.some(name => name.endsWith('/libc++_shared.so'))) throw new Error('C++ runtime missing');
const tables = libraries.map(name => ({
  name,
  symbols: symbols(execFileSync('unzip', ['-p', apk, name], { maxBuffer: 128 * 1024 * 1024 })),
}));
const exports = new Set(tables.flatMap(t => t.symbols.filter(s => s.defined).map(s => s.name)));
const missing = tables.flatMap(t => t.symbols
  .filter(s => !s.defined && !s.weak && s.name.includes('St6__ndk1') && !exports.has(s.name))
  .map(s => `${t.name}: ${s.name}`));
if (missing.length) {
  console.error(`APK contains unresolved Android C++ runtime symbols (${missing.length}):\n${missing.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Android arm64 C++ symbol check passed (${libraries.length} libraries). Device verification is still required.`);
}
