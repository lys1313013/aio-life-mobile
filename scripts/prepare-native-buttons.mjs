import fs from 'node:fs';
import path from 'node:path';
import { parse as parseSfc } from '@vue/compiler-sfc';
import { parse as parseTemplate } from '@vue/compiler-dom';

// 原生 button 不允许嵌套组件。只改变 App 工程，Web/微信保留真正的 button。
export function transformNativeButtons(source) {
  const { descriptor } = parseSfc(source);
  if (!descriptor.template || !descriptor.scriptSetup) return source;
  const base = descriptor.template.loc.start.offset;
  const changes = [];
  function visit(node) {
    if (node.type === 1 && node.tag === 'button' && node.children.some(child => child.type === 1)) {
      const start = base + node.loc.start.offset;
      const end = base + node.loc.end.offset;
      changes.push({ start: start + 1, end: start + 7, text: 'AioNativeButton' });
      const closing = source.lastIndexOf('</button', end);
      if (closing < start) throw new Error('Native button closing tag missing');
      changes.push({ start: closing + 2, end: closing + 8, text: 'AioNativeButton' });
    }
    for (const child of node.children || []) visit(child);
  }
  visit(parseTemplate(descriptor.template.content));
  if (!changes.length) return source;
  changes.push({ start: descriptor.scriptSetup.loc.start.offset, end: descriptor.scriptSetup.loc.start.offset,
    text: "\nimport AioNativeButton from '@/components/AioNativeButton.uvue'\n" });
  for (const edit of changes.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}

export function prepareNativeButtons(stage) {
  let count = 0;
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'unpackage', '.hbuilderx', 'uni_modules'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.uvue')) {
        const source = fs.readFileSync(file, 'utf8');
        const result = transformNativeButtons(source);
        if (result !== source) { fs.writeFileSync(file, result); count++; }
      }
    }
  }
  walk(stage);
  console.log(`App 自定义按钮已适配：${count} 个组件/页面`);
}
