import { test, expect } from '@playwright/test';

test('首页显眼意见反馈入口可键盘打开并真实提交', async ({ page }) => {
  let submitted;
  await page.route('**/api/feedback', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ accepted: true, id: 'feedback-e2e' }) });
  });
  await page.goto('/');
  const entry = page.getByRole('button', { name: '意见反馈' });
  await expect(entry).toBeVisible();
  await entry.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '告诉我们哪里还能更好' })).toBeVisible();
  await page.getByLabel('反馈内容').fill('希望视频等待界面更清楚');
  await page.getByRole('button', { name: '提交反馈' }).click();
  await expect(page.getByText('已收到，谢谢你认真告诉我们。')).toBeVisible();
  expect(submitted.message).toBe('希望视频等待界面更清楚');
});
