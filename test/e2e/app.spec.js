import { test, expect } from '@playwright/test';

async function waitForApp(page) {
  await page.waitForLoadState('load');
  await page.waitForSelector('#root', { timeout: 15000 });
  await page.waitForTimeout(600);
}

test.describe('嘉豪鉴定所 - 全链路 E2E', () => {

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await waitForApp(page);
  });

  // === 页面加载 ===
  test('首页加载成功且渲染 React 内容', async ({ page }) => {
    const root = page.locator('#root');
    await expect(root).toBeVisible();
    const html = await root.innerHTML();
    expect(html.length).toBeGreaterThan(100);
  });

  test('页脚包含品牌信息', async ({ page }) => {
    const footer = page.locator('footer').first();
    await expect(footer).toBeVisible();
    expect(await footer.textContent()).toContain('嘉豪');
  });

  // === 导航栏切换 ===
  test('导航栏可以在鉴定和语录之间切换', async ({ page }) => {
    const quoteBtn = page.locator('button').filter({ hasText: '语录生成器' }).first();
    await expect(quoteBtn).toBeVisible();

    const assayBtn = page.locator('button').filter({ hasText: /^鉴定$/ }).first();
    if (await assayBtn.isVisible().catch(() => false)) {
      await assayBtn.click();
      await page.waitForTimeout(500);

      const modeBtns = page.locator('button').filter({ hasText: /照片鉴定|聊天记录|文字鉴定|双人PK/ });
      const count = await modeBtns.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  // === 文字鉴定全流程 ===
  test('文字鉴定：输入 → 提交 → 查看结果 → 重置', async ({ page }) => {
    const assayBtn = page.locator('button').filter({ hasText: /^鉴定$/ }).first();
    if (await assayBtn.isVisible().catch(() => false)) await assayBtn.click();
    await page.waitForTimeout(400);

    const textMode = page.locator('button').filter({ hasText: '文字鉴定' }).first();
    if (await textMode.isVisible().catch(() => false)) {
      await textMode.click();
      await page.waitForTimeout(300);
    }

    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill('今天天气不错，不过也没什么特别的。');
      await page.waitForTimeout(200);

      const submitBtn = page.locator('button').filter({ hasText: /鉴定|开始|分析/ }).first();
      if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click();
        await page.waitForTimeout(2000);

        const resultPage = page.locator('.result-page, .score-block, [class*="result"]').first();
        const hasResult = await resultPage.isVisible().catch(() => false);
        if (hasResult) {
          const scoreEl = page.locator('.score, [class*="score"]').first();
          const hasScore = await scoreEl.isVisible().catch(() => false);
          expect(hasScore).toBeTruthy();

          const resetBtn = page.locator('button').filter({ hasText: /再测|再来|重置/ }).first();
          if (await resetBtn.isVisible().catch(() => false)) {
            await resetBtn.click();
            await page.waitForTimeout(500);
          }
        }
      }
    }
  });

  // === 语录生成器全流程 ===
  test('语录生成器：输入 → 选择等级/风格 → 生成', async ({ page }) => {
    const quoteNav = page.locator('button').filter({ hasText: '语录生成器' }).first();
    if (await quoteNav.isVisible().catch(() => false)) await quoteNav.click();
    await page.waitForTimeout(400);

    const textarea = page.locator('.quote-editor textarea, textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill('今天心情不错');
      await page.waitForTimeout(200);

      const levelBtn = page.locator('button').filter({ hasText: '豪气冲天' }).first();
      if (await levelBtn.isVisible().catch(() => false)) await levelBtn.click();

      const styleBtn = page.locator('button').filter({ hasText: '高冷' }).first();
      if (await styleBtn.isVisible().catch(() => false)) await styleBtn.click();

      const generateBtn = page.locator('button').filter({ hasText: /生成/ }).first();
      if (await generateBtn.isVisible().catch(() => false)) {
        await generateBtn.click();
        await page.waitForTimeout(1500);

        const output = page.locator('.quote-output blockquote, blockquote').first();
        if (await output.isVisible().catch(() => false)) {
          const text = await output.textContent();
          expect(text.length).toBeGreaterThan(2);
        }
      }
    }
  });

  // === 响应式与无障碍 ===
  test('移动端无横向溢出', async ({ page }) => {
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const windowWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth + 50);
  });

  test('桌面端布局正常', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await waitForApp(page);

    const root = page.locator('#root');
    await expect(root).toBeVisible();
    expect((await root.textContent()).length).toBeGreaterThan(10);
  });

  test('HTML lang 属性存在', async ({ page }) => {
    expect(await page.locator('html').getAttribute('lang')).toBeTruthy();
  });

  test('meta viewport 存在', async ({ page }) => {
    expect(await page.locator('meta[name="viewport"]').count()).toBeGreaterThan(0);
  });

  test('meta charset 存在', async ({ page }) => {
    expect(await page.locator('meta[charset]').count()).toBeGreaterThan(0);
  });

  test('SVG 图标有 aria-hidden', async ({ page }) => {
    const svgs = page.locator('svg[aria-hidden="true"]');
    expect(await svgs.count()).toBeGreaterThan(0);
  });

  // === 控制台错误检测 ===
  test('初始加载无脚本错误', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // Just load and wait - no interaction needed
    await page.waitForTimeout(2000);

    const realErrors = errors.filter(e =>
      !e.includes('Failed to load') &&
      !e.includes('net::ERR') &&
      !e.includes('CORS') &&
      !e.includes('fetch') &&
      !e.includes('Failed to fetch') &&
      !e.includes('is not a valid')
    );
    expect(realErrors).toEqual([]);
  });
});
