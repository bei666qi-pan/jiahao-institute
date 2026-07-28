import { test, expect } from '@playwright/test';

test.use({ baseURL: 'https://jiahao.versecraft.cn' });
test.skip(process.env.PRODUCTION_SMOKE !== 'true', '仅在生产冒烟工作流中运行');

const EXPECTED_SERVICE_VERSION = 5;
const cases = [
  { input: '累了', mode: 'hao', level: '豪气冲天', style: '高冷', minimumLength: 12, anchors: /累/ },
  { input: '凡人之血', mode: 'hao', level: '豪气冲天', style: '高冷', minimumLength: 12, anchors: /(凡人|之血|凡.*血)/ },
  { input: '今天有点累', mode: 'hao', level: '豪气逼人', style: '深情', minimumLength: 10, anchors: /(今天|累)/ },
  { input: '我也没说什么，只是你们可能理解不了。', mode: 'dehao', minimumLength: 4 },
];

test('production quote matrix calls the real cloud API and updates every result', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const quoteNav = page.locator('.site-header nav button', { hasText: '语录生成器' });
  await expect(quoteNav).toBeVisible();
  await quoteNav.click();

  const input = page.getByLabel('要转换的原句');
  const output = page.locator('.quote-output blockquote');
  await expect(input).toBeVisible();

  for (const sample of cases) {
    const modeName = sample.mode === 'dehao' ? '一键说人话' : '豪化';
    await page.getByRole('button', { name: modeName, exact: true }).click();
    if (sample.mode === 'hao') {
      await page.getByRole('button', { name: sample.level, exact: true }).click();
      await page.getByRole('button', { name: sample.style, exact: true }).click();
    }
    await input.fill(sample.input);

    const before = (await output.textContent())?.trim() || '';
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/quote') && response.request().method() === 'POST',
      { timeout: 70_000 },
    );
    await page.locator('button.quote-generate').click();

    const response = await responsePromise;
    const body = await response.json();
    const generated = typeof body.output === 'string' ? body.output.trim() : '';
    console.log(`QUOTE_CASE=${JSON.stringify({ ...sample, status: response.status(), body })}`);

    expect(response.ok(), JSON.stringify(body)).toBeTruthy();
    expect(body.serviceVersion).toBe(EXPECTED_SERVICE_VERSION);
    expect(body.source).toMatch(/^云端文字大模型/);
    expect(generated).not.toBe(sample.input);
    expect(generated.replace(/\s/g, '').length).toBeGreaterThanOrEqual(sample.minimumLength);
    if (sample.anchors) expect(generated).toMatch(sample.anchors);
    await expect(output).not.toHaveText(before);
    await expect(output).toHaveText(body.output);
    await expect(page.getByText('云端分析已完成')).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
});
