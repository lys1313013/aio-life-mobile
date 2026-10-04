import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,access} from 'node:fs/promises'
const source=await readFile(new URL('../src/services/life-catalog.ts',import.meta.url),'utf8')
const {nativeDestination}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const pages=JSON.parse(await readFile(new URL('../src/pages.json',import.meta.url),'utf8'))
const routes=[...pages.pages.map(p=>p.path),...(pages.subPackages||[]).flatMap(pack=>pack.pages.map(p=>pack.root+'/'+p.path))]
const businessPaths=[
 '/analytics','/workspace','/profile','/vben-admin/about',
 '/task/todo','/task/goal','/task-center/todo','/task-center/goal',
 '/time/time-tracker','/time/dashboard','/time/my-categories','/time/category-admin',
 '/record/exercise','/my-hub/exercise/category-config','/record/videoWatch','/record/movie','/record/read','/record/weread',
 '/record/think','/record/memo','/record/performance','/record/milestone','/record/anniversary','/my-hub/honor','/my-hub/feedback',
 '/relationship/graph','/record/password','/password-manager','/coding/github','/coding/leetcode','/coding/csdn',
 '/finance/dashboard','/finance/income','/finance/expense','/finance/import','/finance/bank-cards',
 '/finance-management/dashboard','/finance-management/income','/finance-management/expense','/finance-management/import','/finance-management/bank-cards',
 '/my-hub/device','/wardrobe','/membership','/message','/mcp/tools','/mcp/api-keys',
 '/config-management/sysDictType','/config-management/sysDictData','/system/user','/system/menu','/system/user-dict','/system/feedback','/system/config','/system/operation-log','/system/access-log',
 '/system/bank-card-covers','/system/storage',
]
test('迁移基线中的所有业务叶菜单及历史别名均有已注册原生页面',()=>{
 for(const path of businessPaths){const destination=nativeDestination(path);assert.ok(destination,`${path} 缺少原生映射`);assert.ok(routes.includes(destination.split('?')[0].slice(1)),`${path} 指向未注册页面 ${destination}`)}
})
test('页面注册无重复或失效文件；底栏留在主包',async()=>{
 assert.equal(new Set(routes).size,routes.length)
 for(const path of routes)await access(new URL('../src/'+path+'.uvue',import.meta.url))
 for(const tab of pages.tabBar.list)assert.ok(pages.pages.some(p=>p.path===tab.pagePath))
})
