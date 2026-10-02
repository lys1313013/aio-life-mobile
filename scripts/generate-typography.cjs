// typography.json 是唯一排版数值来源；SCSS 编译后不依赖运行时 CSS 变量。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'src/styles/typography.json'), 'utf8'));
for (const group of ['roles', 'poster']) {
  for (const [name, role] of Object.entries(config[group])) {
    if (!/^[a-z][a-z-]*$/.test(name) || !Number.isFinite(role.size) || role.size <= 0 ||
      !Number.isFinite(role.lineHeight) || role.lineHeight < role.size ||
      ![400, 500, 600, 700].includes(role.weight)) throw new Error(`Invalid typography role: ${group}.${name}`);
  }
}
const quote = value => JSON.stringify(value);
const roleMap = Object.entries(config.roles).map(([name, role]) =>
  `  ${quote(name)}: (size: ${role.size}px, weight: ${role.weight}, line-height: ${role.lineHeight}px),`).join('\n');
let output = '/* Generated from typography.json. Do not hand edit. */\n';
output += `$type-roles: (\n${roleMap}\n);\n`;
for (const group of ['weights', 'families', 'leading', 'tracking']) {
  const entries = Object.entries(config[group]).map(([name, value]) => {
    if (!/^[a-z][a-zA-Z-]*$/.test(name)) throw new Error(`Invalid typography key: ${name}`);
    if (group === 'weights' && ![400,500,600,700].includes(value)) throw new Error(`Invalid weight: ${name}`);
    if (group === 'leading' && !/^(normal|\d+(?:\.\d+)?px)$/.test(value)) throw new Error(`Invalid leading: ${name}`);
    if (group === 'tracking' && !/^-?\d+(?:\.\d+)?px$/.test(value)) throw new Error(`Invalid tracking: ${name}`);
    return `  ${quote(name)}: ${group === 'families' ? quote(value) : value},`;
  });
  output += `$type-${group}: (\n${entries.join('\n')}\n);\n`;
}
const file = path.join(root, 'src/styles/_typography-tokens.scss');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== output)
    throw new Error('Typography SCSS is stale. Run npm run typography:generate.');
} else fs.writeFileSync(file, output);
