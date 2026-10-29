const fs = require('node:fs');
const palette = require('../src/theme.json');
const target = 'src/styles/_theme-tokens.scss';
const roles = { backgroundColor: 'page', surfaceColor: 'surface', overlayColor: 'overlay', skeletonColor: 'skeleton', tabSelectedColor: 'accent' };
const content = '// Generated from src/theme.json; do not edit.\n' + Object.entries(palette).flatMap(([mode, values]) => Object.entries(roles).map(([key, role]) => `$theme-${role}-${mode}: ${values[key]};`)).join('\n') + '\n';
if (process.argv.includes('--check')) { if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) { console.error('Theme tokens are stale; run npm run theme:generate'); process.exit(1); } }
else fs.writeFileSync(target, content);
