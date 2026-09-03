import { test, expect } from '@playwright/test';

async function openStudio(page) {
  await page.goto('/');
  const labButton = page.viewportSize()?.width <= 760
    ? page.getByRole('button', { name: '实验室', exact: true })
    : page.getByRole('button', { name: '抽象实验室', exact: true });
  await labButton.click();
  await page.getByRole('button', { name: /角色创作室/ }).click();
  await expect(page.getByRole('group', { name: '选择创作角色' })).toBeVisible();
}

async function chooseJiahao(page) {
  await page.getByRole('group', { name: '选择创作角色' }).getByRole('button').nth(1).click();
}

async function chooseVideo(page) {
  await page.getByRole('group', { name: '选择图片或视频' }).getByRole('button').nth(1).click();
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/videos/quota', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ limit: 1, used: 0, remaining: 1, resetAt: '2026-09-04T16:00:00.000Z', activeTaskId: null }),
  }));
});

test('角色与媒介切换会同步更新文案和主操作', async ({ page }) => {
  await openStudio(page);
  await chooseJiahao(page);
  await expect(page.getByLabel('想让嘉豪演一个什么场面？')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成嘉豪图片' })).toBeVisible();
  await chooseVideo(page);
  await expect(page.getByText('今日可用 1 / 1')).toBeVisible();
  await expect(page.getByRole('button', { name: '生成嘉豪视频' })).toBeVisible();
});

test('奶龙和嘉豪图片使用独立请求并可跨页返回下载', async ({ page }) => {
  let finishGeneration;
  const generationReleased = new Promise((resolve) => { finishGeneration = resolve; });
  let requestBody;
  await page.route('**/api/images/generate', async route => {
    requestBody = route.request().postDataJSON();
    await generationReleased;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id: 'jiahao-image-e2e', provider: 'volcengine', model: 'doubao-seedream-5.0-lite',
      character: requestBody.character, mediaType: 'image', imageDataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', aspectRatio: requestBody.aspectRatio,
    }) });
  });

  await openStudio(page);
  await chooseJiahao(page);
  await page.getByLabel('想让嘉豪演一个什么场面？').fill('电蓝雨夜里回头');
  await page.getByRole('button', { name: '竖版 3:4' }).click();
  await page.getByRole('button', { name: '生成嘉豪图片' }).click();
  await expect(page.getByText('嘉豪图片正在生成')).toBeVisible();
  const assayButton = page.viewportSize()?.width <= 760
    ? page.getByRole('button', { name: '鉴定', exact: true }).last()
    : page.getByRole('button', { name: '嘉豪鉴定', exact: true }).first();
  await assayButton.click();
  await expect(page.getByText('嘉豪图片正在生成')).toBeVisible();
  finishGeneration();
  await expect(page.getByText('嘉豪图片已送达')).toBeVisible();
  await page.getByRole('button', { name: '查看作品' }).click();
  await expect(page.getByRole('img', { name: '生成的嘉豪场景' })).toBeVisible();
  await expect(page.getByRole('link', { name: /下载图片/ })).toHaveAttribute('download', /嘉豪创作/);
  expect(requestBody.character).toBe('jiahao');
});

test('视频任务刷新后恢复，成功态提供真实播放器和下载', async ({ page }) => {
  const taskId = '33333333-3333-4333-8333-333333333333';
  let statusChecks = 0;
  await page.route('**/api/videos/tasks', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const input = route.request().postDataJSON();
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
      id: taskId, character: input.character, mediaType: 'video', status: 'queued', aspectRatio: input.aspectRatio,
      quota: { limit: 1, used: 1, remaining: 0, resetAt: '2026-09-04T16:00:00.000Z', activeTaskId: taskId },
    }) });
  });
  await page.route(`**/api/videos/tasks/${taskId}`, async route => {
    statusChecks += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id: taskId, character: 'jiahao', mediaType: 'video', status: 'succeeded', aspectRatio: '16:9',
      videoUrl: '/assets/test/jiahao-result.mp4', quota: { limit: 1, used: 1, remaining: 0, resetAt: '2026-09-04T16:00:00.000Z', activeTaskId: null },
    }) });
  });

  await openStudio(page);
  await chooseJiahao(page);
  await chooseVideo(page);
  await page.getByRole('button', { name: '横版 16:9' }).click();
  await page.getByRole('button', { name: '生成嘉豪视频' }).click();
  await expect(page.getByText('嘉豪视频已进入队列')).toBeVisible();
  const persisted = await page.evaluate(() => localStorage.getItem('jiahao-media-task-v1'));
  expect(persisted).toContain(taskId);
  expect(persisted).not.toContain('电蓝片场');
  await page.reload();
  await expect(page.getByText('嘉豪视频已送达')).toBeVisible();
  await page.getByRole('button', { name: '查看作品' }).click();
  await expect(page.getByLabel('生成的嘉豪视频')).toHaveAttribute('controls', '');
  await expect(page.getByRole('link', { name: /下载视频/ })).toHaveAttribute('download', /嘉豪视频/);
  expect(statusChecks).toBeGreaterThan(0);
});
