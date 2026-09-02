import { test, expect } from '@playwright/test';

test('首页使用新导航与双指数鉴定主叙事', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '先别急着装正常。' })).toBeVisible();
  await expect(page.getByRole('navigation')).toContainText(/抽象实验室|实验室/);
  const preview = page.getByLabel('双指数预览');
  await expect(preview.getByText('嘉豪指数')).toBeVisible();
  await expect(preview.getByText('76')).toBeVisible();
  await expect(preview.getByText('奶龙指数')).toBeVisible();
  await expect(preview.getByText('91')).toBeVisible();
  await expect(page.getByRole('button', { name: /开始抽象鉴定/ })).toBeVisible();
});

test('文字鉴定回退结果同时展示嘉豪指数和奶龙指数', async ({ page }) => {
  await page.route('**/api/analyze', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试触发回退' }) }));
  await page.goto('/');
  await page.getByRole('tab', { name: '文字' }).click();
  await page.getByLabel('要鉴定的文字').fill('也没什么，只是一个人习惯了。');
  await page.getByLabel(/同意将内容用于本次娱乐分析/).check();
  await page.getByRole('button', { name: /开始抽象鉴定/ }).click();

  await expect(page.getByRole('heading', { name: '鉴定结果' })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText('嘉豪指数')).toBeVisible();
  await expect(page.getByText('奶龙指数')).toBeVisible();
  await expect(page.getByRole('button', { name: /生成战绩卡/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /拉好友来测/ })).toBeVisible();
});

test('抽象实验室可完成五题奶龙反应局', async ({ page }) => {
  await page.goto('/');
  const labButton = page.viewportSize()?.width <= 760
    ? page.getByRole('button', { name: '实验室', exact: true })
    : page.getByRole('button', { name: '抽象实验室', exact: true });
  await labButton.click();
  await expect(page.getByRole('heading', { name: '今天抽象点什么？' })).toBeVisible();
  await expect(page.getByText('奶龙反应局')).toBeVisible();

  for (let index = 0; index < 5; index += 1) {
    await page.locator('.reaction-option').first().click();
  }
  await expect(page.getByText('本局奶龙指数')).toBeVisible();
});

test('人格档案同时展示嘉豪物种与奶龙人格', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '我的档案' }).click();
  await expect(page.getByRole('heading', { name: '人格档案' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '嘉豪物种' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '奶龙人格' })).toBeVisible();
});
