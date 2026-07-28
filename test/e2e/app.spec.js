import { test, expect } from '@playwright/test';

const assayResult = {
  score: 88,
  level: '豪气冲天',
  type: '自在极意豪',
  verdict: '表面云淡风轻，实际每个细节都在释放豪气。',
  comment: '神秘感与豪言匹配维度表现突出。',
  dimensions: { mystery: 92, flex: 81, niche: 76, deep: 69, show: 85, language: 90 },
  traits: ['黑口罩信号', '低头侧脸'],
  evidence: ['语气克制但暗含表达欲', '关键词触发豪气信号', '整体风格统一'],
  source: 'E2E 云端模型',
  resultToken: 'e2e-result-token',
};

const pkResult = {
  participants: [
    { name: '选手 A', score: 91, type: '自在极意豪', verdict: '豪气稳定输出。', dimensions: { mystery: 95, flex: 86, niche: 80, deep: 70, show: 92, language: 88 } },
    { name: '选手 B', score: 74, type: '计算机嘉豪', verdict: '术语型豪气明显。', dimensions: { mystery: 62, flex: 76, niche: 72, deep: 60, show: 68, language: 89 } },
  ],
  battle: { winner: 'A', title: '选手 A 胜出', reason: '选手 A 在神秘感和镜头掌控维度形成优势。', decisiveDimensions: ['神秘感', '镜头掌控'], source: 'E2E PK 模型' },
  id: '嘉豪-PK-E2E0001',
};

const roomPayload = {
  room: {
    code: 'JH8F32A',
    name: '404 宿舍豪气榜',
    roomType: 'dorm',
    memberLimit: 8,
    memberCount: 1,
    allowPk: true,
    status: 'active',
    expiresAt: '2099-01-01T00:00:00.000Z',
    isOwner: true,
    isExpired: false,
    averageScore: 88,
    highestScore: 88,
  },
  members: [{
    memberId: '11111111-1111-4111-8111-111111111111',
    nickname: '宿舍长',
    score: 88,
    level: '豪气冲天',
    type: '自在极意豪',
    dimensions: assayResult.dimensions,
    verified: true,
    source: 'E2E 云端模型',
    joinedAt: '2026-07-28T00:00:00.000Z',
    rank: 1,
    isSelf: true,
  }],
  isMember: true,
};

async function mockApis(page) {
  await page.route('**/api/analyze', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assayResult) }));
  await page.route('**/api/pk', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pkResult) }));
  await page.route('**/api/quote', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      output: body.mode === 'dehao' ? '简单来说，我今天有点累。' : '不是累，只是有些路，不需要所有人理解。',
      source: 'E2E 文字模型',
    }) });
  });
  await page.route('**/api/social/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/social/session') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, nickname: '', rooms: [] }) });
    }
    if (url.pathname === '/api/social/rooms' && request.method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ code: 'JH8F32A' }) });
    }
    if (url.pathname === '/api/social/rooms/JH8F32A') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(roomPayload) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function enterAssay(page) {
  await page.getByRole('button', { name: '鉴定', exact: true }).click();
  await expect(page.getByRole('tablist', { name: '鉴定方式' })).toBeVisible();
}

async function enterTextAssay(page) {
  await enterAssay(page);
  await page.getByRole('tab', { name: '文字鉴定' }).click();
}

async function completeTextAssay(page) {
  await enterTextAssay(page);
  await page.getByText('我同意将内容发送至云端大模型做娱乐分析').click();
  await page.getByLabel('输入一句最有感觉的话').fill('也没什么，只是习惯一个人处理。');
  await page.getByRole('button', { name: /开始鉴定/ }).click();
  await expect(page.locator('.result-page')).toBeVisible({ timeout: 8_000 });
}

test.describe('嘉豪鉴定所全链路', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('导航、图鉴与历史空状态', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '把一句普通话，调成嘉豪频道。' })).toBeVisible();
    await enterAssay(page);
    await page.getByRole('button', { name: '图鉴', exact: true }).click();
    await expect(page.getByRole('heading', { name: '嘉豪物种图鉴' })).toBeVisible();
    await page.getByRole('listitem', { name: '查看计算机嘉豪' }).click();
    await expect(page.getByRole('heading', { name: '计算机嘉豪' })).toBeVisible();
    await page.getByRole('button', { name: /我的鉴定/ }).click();
    await expect(page.getByRole('dialog', { name: '鉴定记录' })).toContainText('还没有鉴定记录');
    await page.getByRole('dialog', { name: '鉴定记录' }).getByRole('button', { name: '关闭' }).click();
  });

  test('文字鉴定校验、云端结果、历史与重置', async ({ page }) => {
    await enterTextAssay(page);
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await expect(page.getByRole('alert')).toContainText('请先确认');
    await page.getByText('我同意将内容发送至云端大模型做娱乐分析').click();
    await page.getByLabel('输入一句最有感觉的话').fill('短');
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await expect(page.getByRole('alert')).toContainText('至少输入 5 个字');
    await page.getByLabel('输入一句最有感觉的话').fill('也没什么，只是习惯一个人处理。');
    const request = page.waitForRequest('**/api/analyze');
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    expect((await request).postDataJSON()).toMatchObject({ mode: 'text' });
    await expect(page.locator('.result-page')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('heading', { name: '自在极意豪' }).first()).toBeVisible();
    await expect(page.getByText('云端分析已完成')).toBeVisible();
    await expect(page.getByRole('img', { name: '六维豪气雷达图' })).toBeVisible();
    await page.getByRole('button', { name: /我的鉴定/ }).click();
    const historyDialog = page.getByRole('dialog', { name: '鉴定记录' });
    await expect(historyDialog).toContainText('自在极意豪');
    await historyDialog.getByRole('button', { name: '关闭' }).click();
    await page.getByRole('button', { name: /再测一次/ }).first().click();
    await expect(page.getByRole('tablist', { name: '鉴定方式' })).toBeVisible();
  });

  test('鉴定接口失败时明确降级', async ({ page }) => {
    await page.unroute('**/api/analyze');
    await page.route('**/api/analyze', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await enterTextAssay(page);
    await page.getByText('我同意将内容发送至云端大模型做娱乐分析').click();
    await page.getByLabel('输入一句最有感觉的话').fill('这个底层逻辑其实不复杂，你们懂的。');
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await expect(page.locator('.result-page')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('云端大模型太火爆，暂时用豪之算法进行计算')).toBeVisible();
  });

  test('照片、聊天文件校验链路', async ({ page }) => {
    await enterAssay(page);
    await page.getByText('我同意将内容发送至云端大模型做娱乐分析').click();
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await expect(page.getByRole('alert')).toContainText('先提交素材');
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'jiahao.png', mimeType: 'image/png', buffer: Buffer.from('fake') });
    await expect(page.getByText('jiahao.png', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '清空已选择文件' }).click();
    await page.getByRole('tab', { name: '聊天记录' }).click();
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'bad.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('bad') });
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('双人 PK 完整裁决链路', async ({ page }) => {
    await enterAssay(page);
    await page.getByRole('tab', { name: '双人PK' }).click();
    const a = page.getByRole('region', { name: '选手 A输入' });
    const b = page.getByRole('region', { name: '选手 B输入' });
    await a.getByRole('tab', { name: '文字' }).click();
    await a.locator('textarea').fill('我不解释，时间自然会证明。');
    await b.locator('textarea').fill('这个框架的底层逻辑你们可能不懂。');
    await page.getByRole('button', { name: /开始豪气 PK/ }).click();
    await expect(page.getByRole('alert')).toContainText('请确认双方素材');
    await page.getByText('我确认拥有双方素材的合法授权').click();
    const request = page.waitForRequest('**/api/pk');
    await page.getByRole('button', { name: /开始豪气 PK/ }).click();
    expect((await request).postDataJSON().participants).toHaveLength(2);
    await expect(page.locator('.pk-result-page')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('heading', { name: '选手 A 胜出' })).toBeVisible();
    await expect(page.getByText('本场胜者')).toBeVisible();
    await page.getByRole('button', { name: /再来一局/ }).first().click();
    await expect(page.getByRole('tablist', { name: '鉴定方式' })).toBeVisible();
  });

  test('语录豪化、去豪化、换一个与降级', async ({ page }) => {
    await page.getByLabel('要转换的原句').fill('今天有点累');
    await page.getByRole('group', { name: '豪气等级' }).getByRole('button', { name: '豪气冲天', exact: true }).click();
    await page.getByRole('group', { name: '风格模式' }).getByRole('button', { name: '高冷', exact: true }).click();
    await page.getByRole('button', { name: /生成嘉豪语录/ }).click();
    await expect(page.locator('.quote-output blockquote')).toHaveText('不是累，只是有些路，不需要所有人理解。');
    await page.getByRole('button', { name: /换一个/ }).click();
    await expect(page.locator('.quote-output blockquote')).not.toBeEmpty();
    await page.getByRole('tab', { name: '一键说人话' }).click();
    await expect(page.getByRole('group', { name: '豪气等级' }).getByRole('button', { name: '豪气冲天', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: /一键把嘉豪说人话/ }).click();
    await expect(page.locator('.quote-output blockquote')).toHaveText('简单来说，我今天有点累。');
    await page.unroute('**/api/quote');
    await page.route('**/api/quote', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await page.getByRole('tab', { name: '豪化' }).click();
    await page.getByRole('button', { name: /生成嘉豪语录/ }).click();
    await expect(page.getByText('云端大模型太火爆，暂时用豪之算法进行计算')).toBeVisible();
  });

  test('好友榜入口、创建与房间落地页', async ({ page }) => {
    await completeTextAssay(page);
    await page.getByRole('button', { name: '创建好友豪气榜' }).click();
    await expect(page.getByRole('heading', { name: '好友豪气榜' })).toBeVisible();
    await page.getByLabel('你的公开昵称').fill('宿舍长');
    await page.getByLabel('榜单名称').fill('404 宿舍豪气榜');
    await page.getByLabel('房间类型').selectOption('dorm');
    await page.getByRole('button', { name: '创建并成为榜主' }).click();
    await expect(page.getByRole('heading', { name: '404 宿舍豪气榜' })).toBeVisible();
    await expect(page.getByText('宿舍长', { exact: true })).toBeVisible();
    await expect(page.getByText('云端可信', { exact: true })).toBeVisible();
  });

  test('摄像头拒绝、响应式与脚本错误', async ({ page, context }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.clearPermissions();
    await enterAssay(page);
    const cameraButton = page.getByRole('button', { name: /使用电脑摄像头/ });
    if (await cameraButton.isVisible()) {
      await cameraButton.click();
      const dialog = page.getByRole('dialog', { name: '授权摄像头自拍' });
      await expect(dialog.getByRole('alert')).toContainText(/授权未成功|无法访问摄像头/);
      await dialog.getByRole('button', { name: '关闭' }).click();
    }
    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(page.locator('#root')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
    }
    expect(errors).toEqual([]);
  });
});
