import { test, expect } from '@playwright/test';

test('抽象生图局可生成和下载图片，成功态不向玩家展示技术信息', async ({ page }) => {
  await page.route('**/api/images/generate', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'minimax-image-e2e',
      provider: 'minimax',
      model: 'image-01',
      source: 'MiniMax 图片生成',
      imageDataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      aspectRatio: '3:4',
      fallback: { used: false },
    }),
  }));

  await page.goto('/');
  const labButton = page.viewportSize()?.width <= 760
    ? page.getByRole('button', { name: '实验室', exact: true })
    : page.getByRole('button', { name: '抽象实验室', exact: true });
  await labButton.click();
  await page.getByRole('button', { name: /奶蛙生图局/ }).click();
  await page.getByLabel('你想让奶蛙干什么？').fill('在雨夜撑伞等公交，神态平静得不合时宜');
  await page.getByRole('button', { name: '竖版 3:4' }).click();
  await page.getByRole('button', { name: /生成抽象现场/ }).click();

  await expect(page.getByRole('img', { name: '生成的抽象奶蛙场景' })).toBeVisible();
  await expect(page.getByText('图好了，拿去整活。')).toBeVisible();
  await expect(page.getByRole('link', { name: /下载图片/ })).toHaveAttribute('download', /奶蛙抽象现场/);
  await expect(page.getByText(/MiniMax|火山备援|实际生成来源/)).toHaveCount(0);
});
