import { chromium } from '@playwright/test';

const SITE_URL = `${(process.env.PRODUCTION_URL || 'https://jiahao.versecraft.cn').replace(/\/$/, '')}/`;
const INPUT = '我今天通过了最终测试，准备发布。';
const EXPECTED_SOURCE = '云端文字大模型';
const EXPECTED_SERVICE_VERSION = 3;

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const quoteNav = page.locator('.site-header nav button', { hasText: '语录生成器' });
  await quoteNav.waitFor({ state: 'visible', timeout: 15_000 });
  await quoteNav.click();

  const input = page.getByLabel('要转换的原句');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(INPUT);

  const output = page.locator('.quote-output blockquote');
  const before = (await output.textContent())?.trim() || '';
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => candidate.url().endsWith('/api/quote') && candidate.request().method() === 'POST',
      { timeout: 55_000 },
    ),
    page.locator('button.quote-generate').click(),
  ]);

  const body = await response.json();
  const generated = typeof body.output === 'string' ? body.output.trim() : '';
  if (!response.ok()) throw new Error(`语录接口返回 HTTP ${response.status()}: ${JSON.stringify(body)}`);
  if (body.source !== EXPECTED_SOURCE) throw new Error(`语录接口来源异常: ${JSON.stringify(body)}`);
  if (body.serviceVersion !== EXPECTED_SERVICE_VERSION) throw new Error(`线上语录服务版本不匹配: ${JSON.stringify(body)}`);
  if (generated.length < 2) throw new Error(`语录接口返回无效结果: ${JSON.stringify(body)}`);
  if (generated === INPUT) throw new Error('豪化结果原样返回了输入');
  if (generated === before) throw new Error('生成后输出未发生变化');

  await output.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
    { selector: '.quote-output blockquote', expected: generated },
    { timeout: 10_000 },
  );
  await page.getByText('云端分析已完成').waitFor({ state: 'visible', timeout: 10_000 });

  if (pageErrors.length) throw new Error(`页面脚本错误: ${pageErrors.join(' | ')}`);
  console.log(`生产语录全链路通过：HTTP ${response.status()}，服务版本 ${body.serviceVersion}，来源 ${body.source}，输出 ${generated}`);
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
