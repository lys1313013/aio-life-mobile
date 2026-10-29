import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(root, 'src');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
function area(file, section) {
  if (file.startsWith('src/uni_modules/')) return '原生插件';
  if (file.startsWith('src/components/')) return '公共组件';
  if (file.startsWith('src/services/')) return '公共服务';
  if (file.startsWith('src/styles/')) return '公共样式';
  if (file === 'src/App.uvue' || file.endsWith('.json')) return '应用与路由';
  if (section === 'style') return '分包/页面样式';
  if (file.endsWith('.ts') || /components\//.test(file)) return '业务适配组件/服务';
  return '页面/业务组件';
}
const branches = [];
for (const absolute of files(sourceRoot)) {
  if (!/\.(?:uvue|ts|uts|scss|json)$/.test(absolute) || /project\.(?:private\.)?config\.json$/.test(absolute)) continue;
  const file = path.relative(root, absolute).replaceAll(path.sep, '/');
  const lines = fs.readFileSync(absolute, 'utf8').split('\n');
  let section = path.extname(file).slice(1);
  for (const [index, line] of lines.entries()) {
    if (/<script\b/.test(line)) section = 'script';
    else if (/^<template>/.test(line)) section = 'template';
    else if (/<style\b/.test(line)) section = 'style';
    const match = line.match(/#(ifdef|ifndef)\s+(.+?)(?:\s*\*\/|\s*-->)?\s*$/);
    if (!match) continue;
    branches.push({ file, line: index + 1, area: area(file, section), section,
      condition: match[1] + ' ' + match[2],
      preview: lines.slice(index + 1, index + 5).filter(value => !/#endif/.test(value)).join(' ').trim().slice(0, 220),
    });
  }
}
const summary = {};
for (const branch of branches) summary[branch.area] = (summary[branch.area] || 0) + 1;
const output = path.join(root, 'artifacts/platform-audit');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'branches.json'), JSON.stringify({ files: new Set(branches.map(b => b.file)).size, count: branches.length, summary, branches }, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'branches.txt'), branches.map(b => `${b.file}:${b.line} [${b.area}/${b.section}] ${b.condition}\n  ${b.preview}`).join('\n') + '\n');
console.log(JSON.stringify({ files: new Set(branches.map(b => b.file)).size, count: branches.length, summary }));
console.log('完整分支位置：artifacts/platform-audit/branches.txt');
