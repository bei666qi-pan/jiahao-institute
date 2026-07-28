import { test, expect } from '@playwright/test';

const cloudAssay = {
  score: 88,
  type: '自在极意豪',
  verdict: '表面云淡风轻，实际每个细节都在释放豪气。',
  comment: '该样本在神秘感与豪言匹配维度表现突出。',
  dimensions: { mystery: 92, flex: 81, niche: 76, deep: 69, show: 85, language: 90 },
  traits: ['黑口罩信号', '低头侧脸', '无意式炫耀'],
  evidence: ['语气克制但暗含表达欲', '关键词触发豪气信号', '整体风格高度统一'],
  source: 'E2E 云端模型',
};

const cloudPk = {
  participants: [
    {
      name: '选手 A', score: 91, type: '自在极意豪', verdict: '豪气稳定输出。',
      dimensions: { mystery: 95, flex: 86, niche: 80, deep: 70, show: 92, language: 88 },
      top: [{ label: '神秘感', value: 95 }], evidence: ['A 证据'], traits: ['A 特征'], comment: 'A 总评', id: 'A-1',
    },
    {
      name: '选手 B', score: 74, type: '计算机嘉豪', verdict: '术语型豪气明显。',
      dimensions: { mystery: 62, flex: 76, niche: 72, deep: 60, show: 68, language: 89 },
      top: [{ label: '豪言匹配', value: 89 }], evidence: ['B 证据'], traits: ['B 特征'], comment: 'B 总评', id: 'B-1',
    },
  ],
  battle: {
    winner: 'A',
    title: '选手 A 胜出',
    reason: '选手 A 在神秘感和镜头掌控维度形成明显优势。',
    decisiveDimensions: ['神秘感', '镜头掌控'],
    source: 'E2E PK 模型',
  },
  id: '嘉豪-PK-E2E0001',
};

async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#root')).toBeVisible();
  await expect(page.getByRole('button', { name: '语录生成器' })).toHaveAttribute('aria-current', 'page');
}

async function openAssay(page) {
  await page.getByRole('button', { name: '鉴定', exact: true }).click();
  await expect(page.getByRole('tablist', { name: '鉴定方式' })).toBeVisible();
}

async function chooseTextAssay(page) {
  await openAssay(page);
  await page.getByRole('tab', { name: '文字鉴定' }).click();
  await expect(page.getByLabel('输入一句最有感觉的话')).toBeVisible();
}

async function acceptAssayConsent(page) {
  await page.getByText('我同意将内容发送至云端大模型做娱乐分析').click();
}

async function mockCloudApis(page) {
  await page.route('**/api/analyze', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cloudAssay) }));
  await page.route('**/api/quote', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ output: body.mode === 'dehao' ? '简单来说，我今天有点累。' : '不是累，只是有些路，本来就不需要所有人理解。', source: 'E2E 文字模型' }),
    });
  });
  await page.route('**/api/pk', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cloudPk) }));
}

test.describe('嘉豪鉴定所 - 全链路 E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockCloudApis(page);
    await openApp(page);
  });

  test('首页、导航、图鉴和历史空状态完整可用', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '嘉豪语录生成器' })).toBeVisible();

    await openAssay(page);
    await expect(page.getByRole('heading', { name: /你身上.*到底有多少豪气/ })).toBeVisible();

    await page.getByRole('button', { name: '图鉴' }).click();
    await expect(page.getByRole('heading', { name: '嘉豪物种图鉴' })).toBeVisible();
    await page.getByRole('button', { name: '查看计算机嘉豪' }).click();
    await expect(page.getByRole('heading', { name: '计算机嘉豪' })).toBeVisible();

    await page.getByRole('button', { name: /我的鉴定/ }).click();
    const history = page.getByRole('dialog', { name: '鉴定记录' });
    await expect(history).toContainText('还没有鉴定记录');
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(history).toBeHidden();
  });

  test('文字鉴定：校验、云端请求、结果、历史恢复和重置', async ({ page }) => {
    await chooseTextAssay(page);

    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await expect(page.getByRole('alert')).toContainText('请先确认内容使用权限');

    await acceptAssayConsent(page);
    await page.getByLabel('输入一句最有感觉的话').fill('短');
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await expect(page.getByRole('alert')).toContainText('至少输入 5 个字');

    await page.getByLabel('输入一句最有感觉的话').fill('也没什么，只是习惯一个人处理。');
    const requestPromise = page.waitForRequest('**/api/analyze');
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    const request = await requestPromise;
    expect(request.postDataJSON()).toMatchObject({ mode: 'text', input: '也没什么，只是习惯一个人处理。' });

    await expect(page.locator('.result-page')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('88', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '自在极意豪' }).first()).toBeVisible();
    await expect(page.getByText('云端分析已完成')).toBeVisible();
    await expect(page.getByRole('img', { name: '六维豪气雷达图' })).toBeVisible();

    await page.getByRole('button', { name: /我的鉴定/ }).click();
    await expect(page.getByRole('dialog', { name: '鉴定记录' })).toContainText('自在极意豪');
    await page.getByRole('dialog', { name: '鉴定记录' }).getByRole('button').filter({ hasText: '自在极意豪' }).click();
    await expect(page.locator('.result-page')).toBeVisible();

    await page.getByRole('button', { name: /再测一次/ }).first().click();
    await expect(page.getByRole('tablist', { name: '鉴定方式' })).toBeVisible();
  });

  test('云端鉴定失败时明确降级到本地算法', async ({ page }) => {
    await page.unroute('**/api/analyze');
    await page.route('**/api/analyze', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '模型维护中' }) }));
    await chooseTextAssay(page);
    await acceptAssayConsent(page);
    await page.getByLabel('输入一句最有感觉的话').fill('这个底层逻辑其实不复杂，你们懂的。');
    await page.getByRole('button', { name: /开始鉴定/ }).click();

    await expect(page.locator('.result-page')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('云端大模型太火爆，暂时用豪之算法进行计算')).toBeVisible();
    await expect(page.getByText(/结果由浏览器内的豪之算法即时生成/)).toBeVisible();
  });

  test('照片和聊天链路具备必填、格式与文件摘要反馈', async ({ page }) => {
    await openAssay(page);
    await page.getByRole('tab', { name: '照片鉴定' }).click();
    await acceptAssayConsent(page);
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await expect(page.getByRole('alert')).toContainText('先提交素材');

    const photoInput = page.locator('input[type="file"]').first();
    await photoInput.setInputFiles({ name: 'jiahao.png', mimeType: 'image/png', buffer: Buffer.from('fake-png') });
    await expect(page.getByText('已捕获 1 份素材')).toBeVisible();
    await expect(page.getByText('jiahao.png')).toBeVisible();
    await page.getByRole('button', { name: '清空已选择文件' }).click();
    await expect(page.getByText('jiahao.png')).toBeHidden();

    await page.getByRole('tab', { name: '聊天记录' }).click();
    const chatInput = page.locator('input[type="file"]').first();
    await chatInput.setInputFiles({ name: 'malware.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('not-allowed') });
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('双人 PK：双方输入、授权、云端裁决、结果与再来一局', async ({ page }) => {
    await openAssay(page);
    await page.getByRole('tab', { name: '双人PK' }).click();
    await expect(page.getByRole('heading', { name: /双人对决/ })).toBeVisible();

    await page.getByRole('tab', { name: '选手 A素材类型' }).getByRole('tab', { name: '文字' }).click();
    const aCard = page.getByRole('region', { name: '选手 A输入' });
    const bCard = page.getByRole('region', { name: '选手 B输入' });
    await aCard.getByRole('textbox').last().fill('我不解释，时间自然会证明。');
    await bCard.getByRole('textbox').last().fill('这个框架的底层逻辑你们可能不懂。');

    await page.getByRole('button', { name: /开始豪气 PK/ }).click();
    await expect(page.getByRole('alert')).toContainText('请确认双方素材');
    await page.getByText('我确认拥有双方素材的合法授权').click();

    const requestPromise = page.waitForRequest('**/api/pk');
    await page.getByRole('button', { name: /开始豪气 PK/ }).click();
    const request = await requestPromise;
    expect(request.postDataJSON().participants).toHaveLength(2);

    await expect(page.locator('.pk-result-page')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: '选手 A 胜出' })).toBeVisible();
    await expect(page.getByText('本场胜者')).toBeVisible();
    await expect(page.getByText('E2E PK 模型')).toBeVisible();

    await page.getByRole('button', { name: /再来一局/ }).first().click();
    await expect(page.getByRole('tab', { name: '双人PK' })).toHaveAttribute('aria-selected', 'true');
  });

  test('语录生成器：豪化、换一个、去豪化和预设切换', async ({ page }) => {
    const input = page.getByLabel('要转换的原句');
    await input.fill('今天有点累');
    await page.getByRole('button', { name: '豪气冲天' }).click();
    await page.getByRole('button', { name: '高冷' }).click();

    const requestPromise = page.waitForRequest('**/api/quote');
    await page.getByRole('button', { name: /生成嘉豪语录/ }).click();
    const request = await requestPromise;
    expect(request.postDataJSON()).toMatchObject({ input: '今天有点累', mode: 'hao', level: '豪气冲天', style: '高冷' });
    await expect(page.locator('.quote-output blockquote')).toHaveText('不是累，只是有些路，本来就不需要所有人理解。');
    await expect(page.getByText('云端分析已完成')).toBeVisible();

    await page.getByRole('button', { name: /换一个/ }).click();
    await expect(page.locator('.quote-output blockquote')).not.toBeEmpty();

    await page.getByRole('tab', { name: '一键说人话' }).click();
    await expect(page.locator('fieldset.quote-levels')).toBeDisabled();
    await page.getByRole('button', { name: /一键把嘉豪说人话/ }).click();
    await expect(page.locator('.quote-output blockquote')).toHaveText('简单来说，我今天有点累。');

    await page.getByRole('button', { name: '自在极意豪 · 小众' }).click();
    await expect(page.getByRole('tab', { name: '豪化' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: '自在极意豪' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: '小众' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('语录云端失败时使用本地生成并展示真实来源', async ({ page }) => {
    await page.unroute('**/api/quote');
    await page.route('**/api/quote', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.getByLabel('要转换的原句').fill('今天有点忙');
    await page.getByRole('button', { name: /生成嘉豪语录/ }).click();

    await expect(page.locator('.quote-output blockquote')).not.toBeEmpty();
    await expect(page.getByText('云端大模型太火爆，暂时用豪之算法进行计算')).toBeVisible();
  });

  test('历史记录可以清空且只保存在本地', async ({ page }) => {
    await chooseTextAssay(page);
    await acceptAssayConsent(page);
    await page.getByLabel('输入一句最有感觉的话').fill('用于写入历史记录的完整测试文本。');
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await expect(page.locator('.result-page')).toBeVisible({ timeout: 5000 });

    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('jiahao-history') || '[]').length)).toBe(1);
    await page.getByRole('button', { name: /我的鉴定/ }).click();
    await page.getByRole('button', { name: '清空本地记录' }).click();
    await expect(page.getByRole('dialog', { name: '鉴定记录' })).toContainText('还没有鉴定记录');
    expect(await page.evaluate(() => localStorage.getItem('jiahao-history'))).toBeNull();
  });

  test('摄像头拒绝授权时给出可恢复提示并可关闭弹窗', async ({ page, context }) => {
    await context.clearPermissions();
    await openAssay(page);
    await page.getByRole('button', { name: /使用电脑摄像头/ }).click();
    const dialog = page.getByRole('dialog', { name: '授权摄像头自拍' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText(/授权未成功|无法访问摄像头/);
    await dialog.getByRole('button', { name: '关闭' }).click();
    await expect(dialog).toBeHidden();
  });

  test('移动端与桌面端无明显横向溢出，页面无未捕获脚本异常', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(page.locator('#root')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(2);
    }

    expect(pageErrors).toEqual([]);
    await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
    await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
    expect(await page.locator('svg[aria-hidden="true"]').count()).toBeGreaterThan(0);
  });
});
