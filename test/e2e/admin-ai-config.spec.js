import { test, expect } from '@playwright/test';

test('AI 配置必须先连通测试才能切换且不回显密钥', async ({ page }) => {
  const configs = { encryptionConfigured: true, configs: [
    { slot: 'text', provider: 'minimax', baseUrl: 'https://api.minimax.cn/v1', model: 'MiniMax-M3', keyConfigured: true },
    { slot: 'vision', provider: 'minimax', baseUrl: 'https://api.minimax.cn/v1', model: 'MiniMax-M3', keyConfigured: true },
    { slot: 'image', provider: 'volcengine', baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations', model: 'doubao-seedream', keyConfigured: true },
    { slot: 'video', provider: 'minimax', baseUrl: 'https://api.minimaxi.com/v1/video_generation', model: 'MiniMax-Hailuo', keyConfigured: true, options: { queryUrl: 'https://api.minimaxi.com/v1/query/video_generation', fileUrl: 'https://api.minimaxi.com/v1/files/retrieve' } },
  ] };
  await page.route('**/api/admin/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, configured: true }) }));
  await page.route('**/api/admin/ai-config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(configs) }));
  await page.route('**/api/admin/ai-config/text/test', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tested: true, testToken: 'one-use-token', latencyMs: 126 }) }));
  await page.route('**/api/admin/ai-config/text/activate', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activated: true }) }));
  await page.goto('/admin/ai-config');
  await expect(page.getByRole('heading', { name: 'AI 配置中心' })).toBeVisible();
  await expect(page.getByText(/可能产生供应商费用/)).toBeVisible();
  const imageCard = page.locator('.ai-config-grid article').filter({ hasText: '角色图片生成' });
  const videoCard = page.locator('.ai-config-grid article').filter({ hasText: '角色视频生成' });
  await expect(imageCard.getByLabel('供应商').locator('option')).toHaveText(['火山引擎']);
  await expect(videoCard.getByLabel('供应商').locator('option')).toHaveText(['MiniMax']);
  const textCard = page.locator('.ai-config-grid article').filter({ hasText: '文字鉴定 / 联赛' });
  const secret = textCard.getByLabel('API 密钥');
  await expect(secret).toHaveValue('');
  await expect(textCard.getByRole('button', { name: '正式切换' })).toBeDisabled();
  await secret.fill('sk-test-connectivity');
  await textCard.getByRole('button', { name: '测试连通' }).click();
  await expect(textCard.getByText(/已通过/)).toBeVisible();
  await expect(textCard.getByRole('button', { name: '正式切换' })).toBeEnabled();
  await textCard.getByRole('button', { name: '正式切换' }).click();
  await expect(page.getByText(/已原子切换/)).toBeVisible();
});
