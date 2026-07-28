import { test, expect } from '@playwright/test';

test.use({ baseURL: 'https://jiahao.versecraft.cn' });
test.skip(process.env.PRODUCTION_SMOKE !== 'true', '仅在生产冒烟工作流中运行');

test('production quote generator calls cloud API and updates output', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const quoteNav = page.locator('.site-header nav button', { hasText: '语录生成器' });
  await expect(quoteNav).toBeVisible();
  await quoteNav.click();

  const input = page.getByLabel('要转换的原句');
  await expect(input).toBeVisible();
  await input.fill('我今天通过了最终测试，准备发布。');

  const output = page.locator('.quote-output blockquote');
  const before = await output.textContent();
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith('/api/quote') && response.request().method() === 'POST',
    { timeout: 55_000 },
  );
  await page.locator('button.quote-generate').click();

  const response = await responsePromise;
  const body = await response.json();
  console.log(`QUOTE_RESPONSE_STATUS=${response.status()}`);
  console.log(`QUOTE_RESPONSE_BODY=${JSON.stringify(body)}`);

  expect(response.ok()).toBeTruthy();
  expect(body.output?.trim().length).toBeGreaterThan(1);
  await expect(output).not.toHaveText(before || '');
  await expect(output).toHaveText(body.output);
  await expect(page.getByText('云端分析已完成')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
