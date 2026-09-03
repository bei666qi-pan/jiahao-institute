import { test, expect } from '@playwright/test';

test('新战绩卡实际生成并保持1080×1440完整画布', async ({ page }) => {
  await page.route('**/api/analyze', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '使用基础成绩' }) }));
  await page.route('**/api/social/rooms', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '好友房暂不可用' }) }));
  await page.goto('/');
  await page.getByRole('button', { name: /测测我有多豪/ }).click();
  await page.getByRole('tab', { name: '文字' }).click();
  await page.getByLabel('要鉴定的文字').fill('也没什么，只是一个人习惯了。');
  await page.getByLabel('同意将内容用于本次娱乐分析').check();
  await page.getByRole('button', { name: /开始鉴定/ }).click();
  await page.getByRole('button', { name: /生成战绩卡/ }).click();

  const card = page.getByRole('dialog', { name: '嘉豪战绩卡' }).getByRole('img');
  await expect(card).toBeVisible();
  await expect(card).toHaveJSProperty('naturalWidth', 1080);
  await expect(card).toHaveJSProperty('naturalHeight', 1440);
});
