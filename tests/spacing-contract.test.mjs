import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import * as sass from 'sass';
const root = fileURLToPath(new URL('..', import.meta.url));
const spacing = JSON.parse(readFileSync(path.join(root, 'src/styles/spacing.json'), 'utf8'));

test('统一间距生成物未漂移，编译后的实际类消费配置变量', () => {
  execFileSync(process.execPath, ['scripts/generate-spacing.cjs', '--check'], { cwd: root });
  const css = sass.compile(path.join(root, 'src/styles/spacing.scss')).css;
  const rule = name => css.match(new RegExp(`\\.${name} \\{([^}]+)\\}`))[1];
  assert.match(rule('ui-page-inset'), new RegExp(`padding: ${spacing.page}px;`));
  assert.match(rule('ui-card'), new RegExp(`padding: ${spacing.card}px;`));
  assert.match(rule('ui-card'), new RegExp(`gap: ${spacing.inline}px;`));
  assert.match(rule('ui-field-compact'), /margin-bottom: 0;/);
  assert.match(rule('ui-toolbar'), /display: flex;/);
});

test('引用间距类的组件均导入公共SCSS，禁止遗留失效CSS路径', () => {
  function scan(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'uni_modules') scan(file); continue; }
      if (!file.endsWith('.uvue')) continue;
      const source = readFileSync(file, 'utf8');
      assert.doesNotMatch(source, /styles\/spacing\.css/, file);
      if (/class="[^"]*\bui-(?:page|card|row|toolbar|field|gap|pad|m[trbl]|p[xy])/.test(source)) {
        assert.match(source, /@use\s+['"][^'"]*spacing\.scss['"]/, file);
        assert.match(source, /<style[^>]*lang="scss"/, file);
      }
    }
  }
  scan(path.join(root, 'src'));
});
