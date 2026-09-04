import { test, expect } from '@playwright/test';

test.use({ baseURL: 'https://jiahao.versecraft.cn' });
test.skip(process.env.PRODUCTION_SMOKE !== 'true', '仅在生产冒烟工作流中运行');

const EXPECTED_SERVICE_VERSION = 6;
const cases = [
  { input: '累了', minimumLength: 12, anchors: /累/ },
  { input: '凡人之血', minimumLength: 12, anchors: /(凡人|之血|凡.*血)/ },
  { input: '今天有点累', minimumLength: 10, anchors: /(今天|累|疲惫|疲劳|倦)/ },
  { input: '我也没说什么，只是你们可能理解不了。', minimumLength: 4 },
];

test('production quote matrix calls the real cloud API and updates every result', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const input = page.getByLabel('要豪化的原句');
  const output = page.locator('.hao-quote-output blockquote');
  await expect(input).toBeVisible();

  for (const sample of cases) {
    await input.fill(sample.input);

    const before = await output.count() ? (await output.textContent())?.trim() || '' : '';
    const responsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/quote') && response.request().method() === 'POST',
      { timeout: 70_000 },
    );
    await page.getByRole('button', { name: /生成嘉豪语录/ }).click();

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
  }

  expect(pageErrors).toEqual([]);
});
