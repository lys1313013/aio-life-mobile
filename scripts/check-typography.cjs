const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'generate-typography.cjs'), '--check']);
const errors = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'uni_modules') scan(file); continue; }
    if (!/\.(uvue|vue|scss|css|ts|uts)$/.test(file) || file.endsWith('_typography-tokens.scss')) continue;
    const source = fs.readFileSync(file, 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const patterns = [
      /\bfont\s*:\s*[^;$\n}]*\d+(?:px|rpx|rem|em)\b/g,
      /\b(?:fontSize|fontWeight|lineHeight|letterSpacing)\s*:\s*['"]?\d+/g,
      /\.font\s*=\s*['"][^'"\n]*\d+px/g,
      /\.setFontSize\(\s*\d/g,
    ];
    // 只能引用语义函数；禁止用页面自建变量绕过单一来源。
    if (file !== path.join(root, 'src/styles/typography.scss')) {
      for (const match of code.matchAll(/\b(font-size|font-weight|line-height|font-family|letter-spacing)\s*:\s*([^;\n}]+)/g)) {
        const prop = match[1], value = match[2].trim();
        const functionName = { 'font-weight': 'type-weight', 'line-height': 'type-(?:line|leading)', 'font-family': 'type-family', 'letter-spacing': 'type-tracking' }[prop];
        const allowed = (prop === 'line-height' && value === '$space-controlMin') ||
          (functionName && new RegExp('^' + functionName + "\\('[a-zA-Z-]+'\\)$").test(value));
        if (!allowed) errors.push(`${path.relative(root, file)}:${code.slice(0, match.index).split('\n').length}: ${match[0]} — use typography.json roles`);
      }
    }
    for (const pattern of patterns) for (const match of code.matchAll(pattern)) {
      const line = code.slice(0, match.index).split('\n').length;
      errors.push(`${path.relative(root, file)}:${line}: ${match[0]} — use typography.json roles`);
    }
  }
}
scan(path.join(root, 'src'));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Typography tokens and source references are consistent.');
