const { dismissModal } = require('./modal');
const {test,expect}=require('@playwright/test');
const {start,shot}=require('./qa-domains-ui');
for(const width of [390,768])for(const theme of ['light','dark'])test(`social populated visual ${width} ${theme}`,async({page})=>{
 await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme:theme});
 await start(page,'vault/index',{existingVault:true,vaultCount:3});await expect(page.locator('.vault-card')).toHaveCount(3);await shot(page,'vault/index',width+'-'+theme,'masked-grid');
 const cards=await page.locator('.vault-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}}));
 expect(cards.every(c=>c.x>=0&&c.x+c.w<=width)).toBe(true);
 await page.getByRole('button',{name:'新增密码',exact:true}).click();await expect(page.getByRole('dialog',{name:'解锁密码库',exact:true})).toBeVisible();await shot(page,'vault/index',width+'-'+theme,'floating-add-unlock');
 await dismissModal(page);
});
