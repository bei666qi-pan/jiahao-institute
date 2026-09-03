import { chromium } from '@playwright/test';

const SITE_URL = `${(process.env.PRODUCTION_URL || 'https://jiahao.versecraft.cn').replace(/\/$/, '')}/`;
const INPUT = '凡人之血';
const EXPECTED_SOURCE_PREFIX = '云端文字大模型';
const EXPECTED_SERVICE_VERSION = 5;

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let loaded = false;
  let lastNavigationError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      loaded = true;
      break;
    } catch (error) {
      lastNavigationError = error;
      console.warn(`生产页面加载第 ${attempt} 次失败：${error.message}`);
    }
  }
  if (!loaded) throw lastNavigationError || new Error('生产页面无法加载');

  const input = page.getByLabel('要豪化的原句');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(INPUT);

  const output = page.locator('.hao-quote-output blockquote');
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) => candidate.url().endsWith('/api/quote') && candidate.request().method() === 'POST',
      { timeout: 70_000 },
    ),
    page.getByRole('button', { name: /生成嘉豪语录/ }).click(),
  ]);

  const body = await response.json();
  const generated = typeof body.output === 'string' ? body.output.trim() : '';
  if (!response.ok()) throw new Error(`语录接口返回 HTTP ${response.status()}: ${JSON.stringify(body)}`);
  if (typeof body.source !== 'string' || !body.source.startsWith(EXPECTED_SOURCE_PREFIX)) throw new Error(`语录接口来源异常: ${JSON.stringify(body)}`);
  if (body.serviceVersion !== EXPECTED_SERVICE_VERSION) throw new Error(`线上语录服务版本不匹配: ${JSON.stringify(body)}`);
  if (generated.length < 12) throw new Error(`凡人之血豪化幅度不足: ${JSON.stringify(body)}`);
  if (generated === INPUT) throw new Error('凡人之血被原样返回');
  if (!/(凡人|之血|凡.*血)/.test(generated)) throw new Error(`豪化结果丢失原句核心意象: ${generated}`);
  await output.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
    { selector: '.hao-quote-output blockquote', expected: generated },
    { timeout: 10_000 },
  );

  if (pageErrors.length) throw new Error(`页面脚本错误: ${pageErrors.join(' | ')}`);
  console.log(`凡人之血生产豪化通过：HTTP ${response.status()}，服务版本 ${body.serviceVersion}，来源 ${body.source}，输出 ${generated}`);
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
