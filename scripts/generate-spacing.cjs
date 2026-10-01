// 单一数值来源生成 SCSS 变量；编译为普通样式，不依赖运行时 CSS 变量。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const s = JSON.parse(fs.readFileSync(path.join(root, 'src/styles/spacing.json'), 'utf8'));
for (const [key, value] of Object.entries(s)) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid spacing token: ${key}`);
}
const vars = Object.fromEntries(Object.keys(s).map(key => [key, '$space-' + key]));
const rules = {
  'ui-page-inset': `width: 100%; max-width: ${vars.contentMax}; align-self: center; box-sizing: border-box; padding: ${vars.page}; padding-bottom: calc(${vars.page} + env(safe-area-inset-bottom));`,
  'ui-page-body': 'width: 100%; box-sizing: border-box; padding: 0;',
  'ui-header-inset': `padding-left: ${vars.page}; padding-right: ${vars.page};`,
  'ui-card': `padding: ${vars.card}; margin-bottom: ${vars.section}; gap: ${vars.inline}; box-sizing: border-box;`,
  'ui-row': `display: flex; flex-direction: row; gap: ${vars.inline};`,
  'ui-toolbar': `display: flex; flex-direction: row; align-items: flex-end; gap: ${vars.inline}; margin-bottom: ${vars.section};`,
  'ui-field-row': `display: flex; flex-direction: row; gap: ${vars.inline}; margin-bottom: ${vars.form};`,
  'ui-section': `margin-bottom: ${vars.section};`,
  'ui-form-field': `margin-bottom: ${vars.form};`,
  'ui-field-label': `margin-bottom: ${vars.fieldLabel};`,
  'ui-field-compact': 'margin-bottom: 0;',
  'ui-field-stretch': 'flex: 1; min-width: 0;',
  'ui-input-inset': `padding: 0 ${vars.card};`,
  'ui-modal-content': `padding: ${vars.modal};`,
  'ui-modal-mask': `padding: ${vars.overlayBlock} ${vars.overlayInline};`,
};
for (const [name, value] of Object.entries({xs:vars.detail, sm:vars.inline, md:vars.section, section:vars.section, card:vars.card, modal:vars.modal})) {
  rules[`ui-gap-${name}`] = `gap: ${value};`;
  rules[`ui-pad-${name}`] = `padding: ${value};`;
  rules[`ui-px-${name}`] = `padding-left: ${value}; padding-right: ${value};`;
  rules[`ui-py-${name}`] = `padding-top: ${value}; padding-bottom: ${value};`;
  for (const [side, prop] of Object.entries({mt:'margin-top', mb:'margin-bottom', ml:'margin-left', mr:'margin-right'})) rules[`ui-${side}-${name}`] = `${prop}: ${value};`;
}
const tokens = '/* Generated from spacing.json. Do not hand edit. */\n' + Object.entries(s).map(([key,value])=>`$space-${key}: ${value}px;`).join('\n') + '\n';
// Web/微信的 TabBar 已占用底部区域；App 保留自身的安全区规则。
const tabInset = `/* #ifdef WEB || MP-WEIXIN */\n.ui-tab-page-inset { padding-bottom: ${vars.page}; }\n/* #endif */\n`;
const text = "/* Generated utility styles. Every spacing value references a shared variable. */\n@use './spacing-tokens' as *;\n" + Object.entries(rules).map(([name, body]) => `.${name} { ${body} }`).join('\n') + '\n' + tabInset;
for (const [name, source] of [['_spacing-tokens.scss', tokens], ['spacing.scss', text]]) {
 const file = path.join(root, 'src/styles', name);
 if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== source) throw new Error('Spacing SCSS is stale. Run npm run spacing:generate.');
 } else fs.writeFileSync(file, source);
}
