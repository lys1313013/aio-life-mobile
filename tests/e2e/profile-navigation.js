const { expect } = require('@playwright/test');

// 隐藏菜单保留页面功能，页面审计直接访问这些路由。
const retainedProfilePages = Object.freeze({
  '系统设置': '/pages/profile/preferences?section=system',
  'MBTI 测试': '/pages/personality/mbti',
  'CBTI 测试': '/pages/personality/cbti',
  '管理与配置': '/pages/admin/directory',
});

function createProfileNavigation(click) {
  async function openProfileEntry(page, name) {
    const url = retainedProfilePages[name];
    if (url) await page.goto('/#' + url);
    else await click(page, name);
  }

  async function back(page) {
    // 直接访问的页面没有 navigateTo 返回栈，审计结束后回到“我”。
    if (Object.values(retainedProfilePages).some(url => page.url().endsWith('/#' + url))) {
      await page.goto('/#/pages/profile/index');
      return;
    }
    const previous = page.url();
    await page.getByRole('button', { name: '返回', exact: true }).first().click();
    await expect(page).not.toHaveURL(previous);
    if (page.url().includes('/pages/profile/account-security')) {
      await page.getByRole('button', { name: '返回', exact: true }).first().click();
    }
  }

  return { openProfileEntry, back };
}

module.exports = { retainedProfilePages, createProfileNavigation };
