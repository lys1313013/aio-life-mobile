import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
const root = fileURLToPath(new URL('..', import.meta.url));
const run = (script, cwd = root, args = []) => execFileSync(process.execPath, [path.join(cwd, 'scripts', script), ...args], { cwd, encoding: 'utf8' });

test('全量页面、公共组件、Canvas 不得重新写死排版，生成物不得漂移', () => {
  run('check-typography.cjs');
});

test('修改唯一配置能同步改变实际表单输入、标签和密码框，未生成时拒绝检查', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aio-typography-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'src/styles'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts/generate-typography.cjs'), path.join(dir, 'scripts/generate-typography.cjs'));
    for (const name of ['typography.json', 'typography.scss'])
      fs.copyFileSync(path.join(root, 'src/styles', name), path.join(dir, 'src/styles', name));
    const configFile = path.join(dir, 'src/styles/typography.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    run('generate-typography.cjs', dir);
    const component = fs.readFileSync(path.join(root, 'src/components/FormField.uvue'), 'utf8');
    const source = component.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1]
      .replaceAll('../styles/', '');
    const compile = () => sass.compileString(source, { loadPaths: [path.join(dir, 'src/styles'), path.join(root, 'src/styles')] }).css;
    const rule = (css, selector) => css.match(new RegExp(`\\.${selector} \\{([^}]+)\\}`))[1];
    const before = compile();
    assert.match(rule(before, 'form-field-input'), new RegExp(`font-size: ${config.roles.body.size}px;`));
    config.roles.body.size += 1;
    config.roles.label.size += 1;
    fs.writeFileSync(configFile, JSON.stringify(config));
    assert.throws(() => run('generate-typography.cjs', dir, ['--check']), /Typography SCSS is stale/);
    run('generate-typography.cjs', dir);
    const after = compile();
    for (const selector of ['form-field-input', 'form-field-password-value', 'form-field-picker-value'])
      assert.match(rule(after, selector), new RegExp(`font-size: ${config.roles.body.size}px;`));
    assert.match(rule(after, 'form-field-label'), new RegExp(`font-size: ${config.roles.label.size}px;`));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('不存在的排版角色立即报错，避免拼错后静默退回平台字号', () => {
  assert.throws(() => sass.compileString("@use 'typography' as *; .sample { @include type-style('missing-role'); }", { loadPaths: [path.join(root, 'src/styles')] }), /Unknown typography role/);
});
