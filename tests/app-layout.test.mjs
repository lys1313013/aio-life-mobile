import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { transformSync } from 'esbuild';

test('App 网格随窗口变化、整行摘要在平板恢复等宽，账本保留四列', async () => {
  const source = fs.readFileSync(new URL('../src/services/app-layout.ts', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '');
  const spacing = JSON.parse(fs.readFileSync(new URL('../src/styles/spacing.json', import.meta.url), 'utf8'));
  const prefix = `const spacing=${JSON.stringify(spacing)};
    const isDark={value:false}; const ref=value=>({value});
    let resize; const onResize=fn=>{resize=fn}, onShow=()=>{};
    const windowInfo={windowWidth:390,windowHeight:800};
    const uni={getWindowInfo:()=>({...windowInfo})};`;
  const code = transformSync(prefix + source + '\nexport {resize,windowInfo,isDark}', { loader: 'ts', format: 'esm' }).code;
  const m = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  const layout = m.useAppLayout();
  assert.equal(layout.appGridItem(2, 'section', [[700, 3]], true).width, 'calc((100% - 0px) / 1)');
  assert.equal(layout.appGridItem(2, 'section').width, `calc((100% - ${spacing.section}px) / 2)`);
  m.windowInfo.windowWidth = 768; m.resize();
  assert.equal(layout.appGridItem(2, 'section', [[700, 3]], true).width, `calc((100% - ${spacing.section * 2}px) / 3)`);
  assert.equal(layout.appLedgerCell(true).width, '72px');
  assert.equal(layout.appLedgerCell(false).width, `calc((100% - ${72 + spacing.detail * 3}px) / 3)`);
  assert.deepEqual(layout.appViewport(.6), { height: '480px' });
  m.isDark.value = true;
  assert.equal(m.appButtonTextColor().color, '#ffffff');
  assert.equal(m.appButtonTextColor(false).color, '#eeeeef');
});
