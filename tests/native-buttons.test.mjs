import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { parse } from '@vue/compiler-sfc';
import { parse as parseTemplate } from '@vue/compiler-dom';
import { transformNativeButtons } from '../scripts/prepare-native-buttons.mjs';

function visitTemplateElements(check) {
  function visit(node, file, descriptor) {
    if (node.type === 1) {
      check(node, file, descriptor);
    }
    for (const child of node.children || []) visit(child, file, descriptor);
  }
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'uni_modules') walk(file);
      else if (entry.isFile() && entry.name.endsWith('.uvue')) {
        const { descriptor } = parse(fs.readFileSync(file, 'utf8'));
        if (descriptor.template) visit(parseTemplate(descriptor.template.content), file, descriptor);
      }
    }
  }
  walk(fileURLToPath(new URL('../src', import.meta.url)));
}

function propName(prop) {
  return prop.name === 'bind' ? prop.arg?.content : prop.name;
}

test('所有页面及公共控件关闭平台按下反馈，避免默认灰底和透明度闪动', () => {
  const missing = [];
  visitTemplateElements((node, file) => {
    const feedback = node.props.filter(prop => propName(prop) === 'hover-class');
    if (node.tag !== 'button' && !feedback.length) return;
    if (feedback.length !== 1 || feedback[0].type !== 6 || feedback[0].value?.content !== 'none') {
      missing.push(`${file}:${node.loc.start.line} <${node.tag}>`);
    }
  });
  assert.deepEqual(missing, [], '自绘按钮必须显式使用 hover-class="none"，保留 loading、选中与键盘焦点状态');
});

test('有禁用或加载状态的内置按钮显式保留组件底色', () => {
  const missing = [];
  const backgroundClasses = new WeakMap();
  visitTemplateElements((node, file, descriptor) => {
    if (node.tag !== 'button' || !node.props.some(prop => ['disabled', 'loading'].includes(propName(prop)))) return;
    const style = node.props.find(prop => propName(prop) === 'style');
    if (/\bbackgroundColor\b|\bbackground-color\s*:/.test(style?.value?.content || style?.exp?.content || '')) return;

    if (!backgroundClasses.has(descriptor)) {
      const classes = new Set();
      for (const { content } of descriptor.styles) {
        const scss = content.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|#\{[^}]*\}/g, '');
        for (const [, selectors, declarations] of scss.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
          if (!declarations.includes('@include button-background(')) continue;
          for (const selector of selectors.split(',')) {
            const className = selector.trim().match(/^\.([\w-]+)$/)?.[1];
            if (className) classes.add(className);
          }
        }
      }
      backgroundClasses.set(descriptor, classes);
    }
    const classes = node.props.find(prop => prop.name === 'class')?.value?.content.split(/\s+/) || [];
    if (!classes.some(name => backgroundClasses.get(descriptor).has(name))) missing.push(`${file}:${node.loc.start.line}`);
  });
  assert.deepEqual(missing, [], '内置按钮必须使用 @include button-background(...) 或显式行内背景，避免平台默认禁用底色');
});

test('App 工程转换嵌套组件按钮并保留点击、禁用和无障碍属性', () => {
  const source = `<script setup lang="ts">const busy = false</script>
    <template><button :disabled="busy" aria-label="新增" @click.stop="save"><AppIcon /><text>新增</text></button><button @click="back">返回</button></template>`;
  const result = transformNativeButtons(source);
  assert.equal(parse(result).errors.length, 0);
  assert.match(result, /<AioNativeButton :disabled="busy" aria-label="新增" @click\.stop="save">/);
  assert.match(result, /<AppIcon \/><text>新增<\/text><\/AioNativeButton>/);
  assert.match(result, /<button @click="back">返回<\/button>/);
  assert.equal(transformNativeButtons(result), result);
});

test('原生自定义按钮在禁用或加载时不能触发业务点击，正常点击保留事件', async () => {
  const component = fs.readFileSync(new URL('../src/components/AioNativeButton.uvue', import.meta.url), 'utf8');
  const script = parse(component).descriptor.scriptSetup.content;
  const prefix = `const state = { disabled: false, loading: false }; const events = [];
    const defineProps = () => state, withDefaults = props => props;
    const defineEmits = () => (...args) => events.push(args);`;
  const code = transformSync(prefix + script + '\nexport { state, events, activate }', { loader: 'ts', format: 'esm' }).code;
  const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const event = { type: 'click' };
  module.state.disabled = true; module.activate(event);
  module.state.disabled = false; module.state.loading = true; module.activate(event);
  assert.equal(module.events.length, 0);
  module.state.loading = false; module.activate(event);
  assert.deepEqual(module.events, [['click', event]]);
});
