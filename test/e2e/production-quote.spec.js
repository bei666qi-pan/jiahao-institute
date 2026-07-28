import { test, expect } from '@playwright/test';

test.use({ baseURL: 'https://jiahao.versecraft.cn' });

test('production quote generator calls cloud API and updates output', async ({ page }) => {
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '语录生成器' }).click();

  const input = page.getByLabel('要转换的原句');
  await input.fill('我今天通过了最终测试，准备发布。');

  const output = page.locator('.quote-output blockquote');
  const before = await output.textContent();
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/quote') && response.request().method() === 'POST');
  await page.getByRole('button', { name: '生成嘉豪语录' }).click();

  const response = await responsePromise;
  const body = await response.json();
  console.log(`QUOTE_RESPONSE_STATUS=${response.status()}`);
  console.log(`QUOTE_RESPONSE_BODY=${JSON.stringify(body)}`);

  expect(response.ok()).toBeTruthy();
  expect(body.output?.trim().length).toBeGreaterThan(1);
  await expect(output).not.toHaveText(before || '');
  await expect(output).toHaveText(body.output);
  await expect(page.getByText('云端分析已完成')).toBeVisible();
  expect(browserErrors).toEqual([]);
});
