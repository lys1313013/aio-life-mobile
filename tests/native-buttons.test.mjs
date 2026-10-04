import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { parse } from '@vue/compiler-sfc';
import { transformNativeButtons } from '../scripts/prepare-native-buttons.mjs';

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
