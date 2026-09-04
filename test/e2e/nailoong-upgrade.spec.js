import { test, expect } from '@playwright/test';

test('根路径以豪气宇宙为首页并把嘉豪与奶龙玩法分开', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '每天一句，七天决出群冠军' })).toBeVisible();
  await expect(page.getByRole('navigation')).toContainText(/抽象实验室|实验室/);
  await expect(page.getByText('奶龙指数')).toHaveCount(0);
  const buttonName = page.viewportSize()?.width <= 760 ? '鉴定' : '嘉豪鉴定';
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  await expect(page.getByRole('heading', { name: '测测你有多豪' })).toBeVisible();
  await expect(page.getByText('奶龙指数')).toHaveCount(0);
});

test('文字鉴定回退结果只展示嘉豪结果', async ({ page }) => {
  await page.route('**/api/analyze', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '测试触发回退' }) }));
  await page.goto('/');
  const buttonName = page.viewportSize()?.width <= 760 ? '鉴定' : '嘉豪鉴定';
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  await page.getByRole('tab', { name: '文字' }).click();
  await page.getByLabel('要鉴定的文字').fill('也没什么，只是一个人习惯了。');
  await page.getByLabel(/同意将内容用于本次娱乐分析/).check();
  await page.getByRole('button', { name: /开始鉴定/ }).click();

  await expect(page.getByRole('heading', { name: '鉴定结果' })).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('.result-score').getByText('嘉豪指数')).toBeVisible();
  await expect(page.getByText('奶龙指数')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /生成战绩卡/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /拉好友来测/ })).toBeVisible();
});

test('抽象实验室可完成五题奶龙反应局', async ({ page }) => {
  await page.goto('/');
  const labButton = page.viewportSize()?.width <= 760
    ? page.getByRole('button', { name: '实验室', exact: true })
    : page.getByRole('button', { name: '抽象实验室', exact: true });
  await labButton.click();
  if (page.viewportSize()?.width > 760) await expect(page.getByRole('heading', { name: '奶龙实验室' })).toBeVisible();
  await expect(page.getByText('奶龙反应局')).toBeVisible();
  await expect(page.locator('.reaction-option')).toHaveCount(3);

  await page.locator('.reaction-option').nth(1).click();
  await expect(page.locator('.reaction-flash')).toBeVisible();
  for (let index = 1; index < 5; index += 1) {
    await page.locator('.reaction-option').first().click();
  }
  await expect(page.getByText('本局奶龙指数')).toBeVisible();
  await expect(page.getByText('本局高光')).toBeVisible();
  await page.getByRole('button', { name: /下一套题/ }).click();
  await expect(page.getByText(/第 2 套/)).toBeVisible();
});

test('奶龙反应局支持自定义输入并交给 AI 判别', async ({ page }) => {
  let submitted = null;
  await page.route('**/api/analyze', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        nailoong: {
          score: 87,
          archetype: '冷面接梗型',
          verdict: '你没有躲开尴尬，而是把它接成了自己的主场。',
          dimensions: {},
        },
      }),
    });
  });
  await page.goto('/');
  const labButton = page.viewportSize()?.width <= 760
    ? page.getByRole('button', { name: '实验室', exact: true })
    : page.getByRole('button', { name: '抽象实验室', exact: true });
  await labButton.click();
  await page.getByRole('button', { name: '写自己的反应' }).click();
  await page.getByLabel('写下你的真实反应').fill('先沉默三秒，然后问大家要不要一起加班。');
  await page.getByRole('button', { name: '交给 AI 判别' }).click();

  await expect(page.getByText('AI 判别奶龙指数')).toBeVisible();
  await expect(page.getByText('冷面接梗型')).toBeVisible();
  expect(submitted.mode).toBe('text');
  expect(submitted.input).toContain('先沉默三秒');
});

test('人格档案用切换视图分开嘉豪物种与奶龙人格', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '人格档案' }).click();
  await expect(page.getByRole('heading', { name: '人格档案' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '嘉豪物种' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '奶龙人格' })).toBeVisible();
  await expect(page.locator('.jiahao-portrait')).toHaveCount(6);
});

test('手机豪气首页让嘉豪人物占满右侧画面', async ({ page }) => {
  test.skip((page.viewportSize()?.width || 999) > 760, '仅检查手机构图');
  await page.goto('/');
  const portrait = page.getByRole('img', { name: '巷子里笑得很开心的嘉豪' });
  await expect(portrait).toBeVisible();
  const box = await portrait.boundingBox();
  expect(box.height).toBeGreaterThan(box.width * 0.8);
  await expect(portrait).toHaveAttribute('src', /hao-universe-hero\.webp$/);
});
