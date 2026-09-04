import { test, expect } from '@playwright/test';

test('AI 配置必须先连通测试才能切换且不回显密钥', async ({ page }) => {
  const configs = { encryptionConfigured: true, configs: [
    { slot: 'text', provider: 'minimax', baseUrl: 'https://api.minimax.cn/v1', model: 'MiniMax-M3', keyConfigured: true },
  ] };
  await page.route('**/api/admin/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, configured: true }) }));
  await page.route('**/api/admin/ai-config', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(configs) }));
  await page.route('**/api/admin/ai-config/text/test', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tested: true, testToken: 'one-use-token', latencyMs: 126 }) }));
  await page.route('**/api/admin/ai-config/text/activate', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activated: true }) }));
  await page.goto('/admin/ai-config');
  await expect(page.getByRole('heading', { name: 'AI 配置中心' })).toBeVisible();
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
