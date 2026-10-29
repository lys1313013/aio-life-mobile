import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { compile } from '@vue/compiler-dom';
import * as Vue from 'vue';

const source = await readFile(new URL('../src/components/PageState.uvue', import.meta.url), 'utf8');
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '');
const js = (await transform(script, { loader: 'ts' })).code;
const template = source.slice(source.indexOf('<template>') + 10, source.lastIndexOf('</template>'));
const render = new Function('Vue', compile(template, {
  mode: 'function', prefixIdentifiers: true, isCustomElement: tag => ['view', 'text'].includes(tag),
}).code)(Vue);

// 用 Vue 实际执行组件脚本与模板，宿主只记录渲染树和异步几何查询。
const makeNode = (tag, text = '') => ({ tag, text, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer({
  createElement: tag => makeNode(tag), createText: text => makeNode('#text', text),
  createComment: text => makeNode('#comment', text),
  setText: (node, text) => { node.text = text; },
  setElementText: (node, text) => { node.children = []; node.text = text; },
  patchProp: (node, key, previous, value) => { node.props[key] = value; },
  insert(node, parent, anchor = null) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    node.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node);
  },
  remove(node) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; },
  parentNode: node => node.parent,
  nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] || null,
});
function descendants(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...node.children.flatMap(child => descendants(child, predicate))];
}
async function fixture(initial = {}) {
  const props = Vue.reactive({ loading: false, error: '', empty: false, emptyText: '暂无记录', skeleton: 'list', retainContent: true, hasContent: false, contentKey: '', inheritInitializing: true, ...initial });
  const initializing = Vue.ref(false);
  const domainRevision = Vue.ref(0);
  const geometry = [];
  let retries = 0;
  const helpers = {
    computed: Vue.computed, getCurrentInstance: Vue.getCurrentInstance, inject: Vue.inject,
    nextTick: Vue.nextTick, onMounted: Vue.onMounted, onUnmounted: Vue.onUnmounted, ref: Vue.ref, watch: Vue.watch,
    defineProps: () => props, withDefaults: value => value, defineEmits: () => () => { retries++; },
    uni: { createSelectorQuery: () => {
      const query = { in: () => query, select: () => query,
        boundingClientRect: callback => { geometry.push(callback); return query; }, exec: () => {} };
      return query;
    } },
  };
  const execute = new Function(...Object.keys(helpers), js + '\nreturn { effectiveLoading, retainedContent, initialHeight, emit };');
  const component = {
    components: {
      ContentSkeleton: { props: ['variant'], setup: p => () => Vue.h('skeleton', { variant: p.variant }) },
      LoadingIndicator: { props: ['label'], setup: p => () => Vue.h('loading', { label: p.label }) },
      MobileButton: { props: ['label'], setup: (p, { attrs }) => () => Vue.h('button', { ...attrs, label: p.label }) },
    },
    setup() { return { ...Vue.toRefs(props), ...execute(...Object.values(helpers)), themeClass: () => '', displayError: value => value }; },
    render,
  };
  const host = makeNode('host');
  const app = renderer.createApp({ setup: () => () => Vue.h(component, null, { default: () => Vue.h('content', '已加载的模拟内容') }) });
  app.provide('domain-page-initializing', initializing);
  app.provide('domain-page-revision', domainRevision);
  app.mount(host);
  async function settle() { await Vue.nextTick(); await Vue.nextTick(); }
  await settle();
  return {
    props, initializing, domainRevision, geometry, settle,
    find: tag => descendants(host, node => node.tag === tag),
    byClass: value => descendants(host, node => String(node.props.class || '').split(' ').includes(value)),
    get retries() { return retries; }, close: () => app.unmount(),
  };
}

test('已有内容更新失败保留内容，错误入口可重试；重试仍使用局部 loading', async () => {
  const h = await fixture({ loading: true });
  try {
    assert.equal(h.find('skeleton').length, 1);
    h.props.loading = false; await h.settle();
    const content = h.find('content')[0];
    h.props.loading = true; await h.settle();
    assert.equal(h.find('content')[0], content);
    assert.equal(h.find('skeleton').length, 0);
    h.props.error = '模拟更新失败'; h.props.loading = false; await h.settle();
    assert.equal(h.find('content')[0], content);
    assert.equal(h.byClass('page-state-initial-error').length, 0);
    assert.equal(h.byClass('page-state-update-error')[0].props['aria-label'], '更新失败：模拟更新失败');
    h.find('button')[0].props.onClick();
    assert.equal(h.retries, 1);
    h.props.loading = true; await h.settle();
    assert.equal(h.byClass('page-state-update-error').length, 0);
    assert.equal(h.find('loading').length, 1);
    assert.equal(h.find('content')[0], content);
  } finally { h.close(); }
});

test('成功空结果刷新及失败均保留原空态节点', async () => {
  const h = await fixture({ loading: true, empty: true });
  try {
    h.props.loading = false; await h.settle();
    const empty = h.byClass('page-state-notice')[0];
    h.props.loading = true; await h.settle();
    assert.equal(h.byClass('page-state-notice')[0], empty);
    h.props.error = '模拟失败'; h.props.loading = false; await h.settle();
    assert.equal(h.byClass('page-state-notice')[0], empty);
    assert.equal(h.find('skeleton').length, 0);
  } finally { h.close(); }
});

test('切换查询对象清除已加载状态，不把旧内容或空态带入新查询', async () => {
  const h = await fixture({ loading: true, empty: true, contentKey: 'book-a' });
  try {
    h.props.loading = false; await h.settle();
    h.props.contentKey = 'book-b'; h.props.loading = true; await h.settle();
    assert.equal(h.find('skeleton').length, 1);
    assert.equal(h.find('content').length, 0);
    assert.equal(h.byClass('page-state-notice').length, 0);
    h.props.error = '模拟新对象失败'; h.props.loading = false; await h.settle();
    assert.equal(h.byClass('page-state-initial-error').length, 1);
    assert.equal(h.byClass('page-state-update-error').length, 0);
  } finally { h.close(); }
});

test('资料初始化有骨架但不冒充业务加载完成，业务完成后返回初始化保留内容', async () => {
  const h = await fixture();
  try {
    h.initializing.value = true; await h.settle();
    assert.equal(h.find('skeleton').length, 1);
    h.initializing.value = false; await h.settle();
    h.props.loading = true; await h.settle();
    assert.equal(h.find('skeleton').length, 1);
    h.props.loading = false; await h.settle();
    const content = h.find('content')[0];
    h.initializing.value = true; await h.settle();
    assert.equal(h.find('skeleton').length, 0);
    assert.equal(h.find('content')[0], content);
  } finally { h.close(); }
});

test('首次失败沿用骨架实测高度，查询切换后忽略旧测量', async () => {
  const h = await fixture({ loading: true, contentKey: 'a' });
  try {
    const oldMeasure = h.geometry.at(-1);
    oldMeasure({ height: 280 });
    h.props.error = '模拟加载失败'; h.props.loading = false; await h.settle();
    assert.deepEqual(h.byClass('page-state-initial-error')[0].props.style, { minHeight: '280px' });
    h.props.contentKey = 'b'; h.props.loading = true; h.props.error = ''; await h.settle();
    oldMeasure({ height: 900 });
    h.geometry.at(-1)({ height: 160 });
    h.props.error = '模拟失败'; h.props.loading = false; await h.settle();
    assert.deepEqual(h.byClass('page-state-initial-error')[0].props.style, { minHeight: '160px' });
  } finally { h.close(); }
});

test('组件卸载后的几何回调安全失效', async () => {
  const h = await fixture({ loading: true });
  const measure = h.geometry.at(-1);
  h.close();
  assert.doesNotThrow(() => measure({ height: 320 }));
});

for (const empty of [false, true]) test(`账号或权限域清理后不沿用已加载${empty ? '空态' : '内容'}，初始化恢复首次骨架`, async () => {
  const h = await fixture({ loading: true, empty });
  try {
    h.props.loading = false; await h.settle();
    assert.equal(h.find('skeleton').length, 0);
    h.domainRevision.value++;
    h.initializing.value = true;
    h.props.empty = true;
    await h.settle();
    assert.equal(h.find('skeleton').length, 1);
    assert.equal(h.find('content').length, 0);
    assert.equal(h.byClass('page-state-notice').length, 0);
    h.props.loading = true; h.initializing.value = false; await h.settle();
    assert.equal(h.find('skeleton').length, 1);
    h.props.loading = false; await h.settle();
    assert.equal(h.find('skeleton').length, 0);
    assert.equal(h.byClass('page-state-notice').length, 1);
  } finally { h.close(); }
});

test('嵌套状态外层可不继承资料初始化，仍响应自身业务 loading', async () => {
  const h = await fixture({ inheritInitializing: false });
  try {
    h.initializing.value = true; await h.settle();
    assert.equal(h.find('skeleton').length, 0);
    assert.equal(h.find('content').length, 1);
    h.props.loading = true; await h.settle();
    assert.equal(h.find('skeleton').length, 1);
  } finally { h.close(); }
});
