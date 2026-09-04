import { test, expect } from '@playwright/test';

async function openStudio(page) {
  await page.goto('/');
  const labButton = page.viewportSize()?.width <= 760
    ? page.getByRole('button', { name: '实验室', exact: true })
    : page.getByRole('button', { name: '抽象实验室', exact: true });
  await labButton.click();
  if (!await page.getByRole('group', { name: '选择创作角色' }).isVisible()) {
    await page.getByRole('button', { name: /角色创作室/ }).click();
  }
}

async function openAssay(page) {
  await page.goto('/');
  const buttonName = page.viewportSize()?.width <= 760 ? '鉴定' : '嘉豪鉴定';
  await page.getByRole('button', { name: buttonName, exact: true }).click();
}

test('文字鉴定请求期间显示明确标注的预计进度', async ({ page }) => {
  await page.route('**/api/analyze', () => new Promise(() => {}));
  await openAssay(page);
  await page.getByRole('tab', { name: '文字' }).click();
  await page.getByLabel('要鉴定的文字').fill('今天下雨，我带了伞。');
  await page.getByLabel('同意将内容用于本次娱乐分析').check();
  await page.getByRole('button', { name: /开始鉴定/ }).click();

  const progressbar = page.getByRole('progressbar', { name: /AI 鉴定预计进度/ });
  await expect(progressbar).toBeVisible();
  await expect(progressbar.locator('..').locator('.ai-progress-copy span')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByText('预计进度，会随等待时间缓慢推进')).toBeVisible();
});

test('图片和视频等待态都提供预计进度，且视频保留真实队列阶段', async ({ page }) => {
  await page.route('**/api/images/generate', () => new Promise(() => {}));
  await page.route('**/api/videos/quota', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ limit: 1, used: 0, remaining: 1, resetAt: '2026-09-05T16:00:00.000Z', activeTaskId: null }),
  }));
  await page.route('**/api/videos/tasks', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const input = route.request().postDataJSON();
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
      id: 'f1111111-1111-4111-8111-111111111111', character: input.character, mediaType: 'video', status: 'queued', aspectRatio: input.aspectRatio,
      quota: { limit: 1, used: 1, remaining: 0, resetAt: '2026-09-05T16:00:00.000Z', activeTaskId: 'f1111111-1111-4111-8111-111111111111' },
    }) });
  });
  await page.route('**/api/videos/tasks/f1111111-1111-4111-8111-111111111111', () => new Promise(() => {}));

  await openStudio(page);
  await page.getByRole('button', { name: '生成奶龙图片' }).click();
  await expect(page.getByRole('progressbar', { name: /奶龙图片预计进度/ })).toBeVisible();

  await page.reload();
  await openStudio(page);
  await page.getByRole('group', { name: '选择图片或视频' }).getByRole('button').nth(1).click();
  await page.getByRole('button', { name: '生成奶龙视频' }).click();
  await expect(page.getByRole('progressbar', { name: /奶龙视频预计进度/ })).toBeVisible();
  await expect(page.getByText('任务已进入供应商队列').first()).toBeVisible();
  await expect(page.getByText('队列状态已确认；百分比为预计进度')).toBeVisible();
});

test('再次生成嘉豪语录时，旧结果不会遮住新的预计进度', async ({ page }) => {
  let quoteRequests = 0;
  await page.route('**/api/quote', route => {
    quoteRequests += 1;
    if (quoteRequests === 1) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ output: '第一句已经生成。', source: 'E2E 文字模型' }),
      });
    }
    return new Promise(() => {});
  });

  await page.goto('/');
  await page.getByRole('button', { name: /生成嘉豪语录/ }).click();
  await expect(page.getByText('第一句已经生成。')).toBeVisible();

  await page.getByRole('button', { name: /生成嘉豪语录/ }).click();
  await expect(page.getByRole('progressbar', { name: /AI 语录预计进度/ })).toBeVisible();
  await expect(page.getByText('第一句已经生成。')).toHaveCount(0);
});
