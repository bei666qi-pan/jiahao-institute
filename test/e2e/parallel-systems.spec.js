import { test, expect } from '@playwright/test';

test('豪气宇宙与抽象实验室并行存在且豪气语录、双人PK可完成', async ({ page }) => {
  await page.route('**/api/quote', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: '不是累，只是豪气暂时选择了沉默。', source: '云端文字大模型' }) }));
  await page.route('**/api/pk', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    kind: 'pk',
    battle: { winner: 'B', title: '乙方豪气胜出', reason: '乙方的豪言匹配和无意炫耀更稳定。', decisiveDimensions: ['豪言匹配'] },
    participants: [
      { name: '甲方', score: 68, type: '潜伏嘉豪' },
      { name: '乙方', score: 87, type: '自在极意豪' },
    ],
  }) }));

  await page.goto('/');
  const isMobile = page.viewportSize()?.width <= 760;
  await expect(page.getByRole('navigation', { name: '主导航' })).toContainText(isMobile ? '豪气' : '豪气宇宙');
  await expect(page.getByRole('navigation', { name: '主导航' })).toContainText(isMobile ? '实验室' : '抽象实验室');
  await expect(page.getByRole('heading', { name: '这里是豪气宇宙' })).toBeVisible();
  await expect(page.getByText('JIAHAO SYSTEM / ORIGINAL')).toHaveCount(0);
  await expect(page.getByText(/系统|原版|保留|一直都在|并行存在/)).toHaveCount(0);

  await page.getByLabel('要豪化的原句').fill('今天有点累');
  await page.getByText('调整豪气风格').click();
  await page.getByRole('button', { name: '豪气冲天' }).click();
  await page.getByRole('button', { name: /生成嘉豪语录/ }).click();
  await expect(page.getByText('不是累，只是豪气暂时选择了沉默。')).toBeVisible();
  await expect(page.getByText(/实际来源|云端文字大模型/)).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /保存语录卡/ }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('嘉豪语录卡.png');

  await page.getByRole('button', { name: /双人豪气 PK/ }).first().click();
  await page.getByLabel('甲方豪气样本').fill('我一般不解释，懂的都懂。');
  await page.getByLabel('乙方豪气样本').fill('这波回调只是长期价值的必经之路。');
  await page.getByLabel('确认双方素材授权').check();
  await page.getByRole('button', { name: /开始豪气 PK/ }).click();
  await expect(page.getByText('乙方豪气胜出')).toBeVisible();

  await page.getByRole('button', { name: /去看图鉴/ }).click();
  await expect(page.getByRole('tab', { name: '嘉豪物种' })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
});
