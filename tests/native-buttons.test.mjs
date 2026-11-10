import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { parse } from '@vue/compiler-sfc';
import { parse as parseTemplate } from '@vue/compiler-dom';
import { transformNativeButtons } from '../scripts/prepare-native-buttons.mjs';

test('所有页面及公共控件关闭平台按下反馈，避免默认灰底和透明度闪动', () => {
  const missing = [];
  function visit(node, file) {
    if (node.type === 1) {
      const feedback = node.props.filter(prop => prop.name === 'hover-class' || (prop.name === 'bind' && prop.arg?.content === 'hover-class'));
      if (node.tag === 'button' || feedback.length) {
        if (feedback.length !== 1 || feedback[0].type !== 6 || feedback[0].value?.content !== 'none') {
          missing.push(`${file}:${node.loc.start.line} <${node.tag}>`);
        }
      }
    }
    for (const child of node.children || []) visit(child, file);
  }
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'uni_modules') walk(file);
      else if (entry.isFile() && entry.name.endsWith('.uvue')) {
        const { descriptor } = parse(fs.readFileSync(file, 'utf8'));
        if (descriptor.template) visit(parseTemplate(descriptor.template.content), file);
      }
    }
  }
  walk(fileURLToPath(new URL('../src', import.meta.url)));
  assert.deepEqual(missing, [], '自绘按钮必须显式使用 hover-class="none"，保留 loading、选中与键盘焦点状态');
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
