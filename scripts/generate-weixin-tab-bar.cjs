// 菜单从 pages.json 生成；主题、间距和排版直接复用客户端公共配置。
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = JSON.parse(fs.readFileSync(path.join(root, 'src/pages.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const file = path.join(root, 'src/services/tab-bar.generated.json');
const source = JSON.stringify(pages.tabBar.list, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== source) throw new Error('微信底栏生成物过期，请运行 npm run tabbar:generate');
} else fs.writeFileSync(file, source);
