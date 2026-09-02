import { test, expect } from '@playwright/test';

const assessment = {
  schemaVersion: 2,
  id: '嘉豪-E2E0001',
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
  jiahao: {
    score: 88, level: '豪气冲天', type: '自在极意豪',
    dimensions: { mystery: 92, flex: 81, niche: 76, deep: 69, show: 85, language: 90 },
  },
  nailoong: {
    score: 91, level: '奶龙显形', archetype: '淡人型奶龙豪',
    verdict: '嘴上说都行，反应已经把抽象写在脸上。',
    dimensions: { hardMouth: 86, deadpan: 91, hungerResilience: 72, abstractReaction: 96, cameraSense: 78, friendPrank: 90 },
  },
};

const roomPayload = {
  room: {
    code: 'JH8F32A', name: '谁更抽象挑战', roomType: 'challenge', memberLimit: 20,
    memberCount: 1, allowPk: true, status: 'active', expiresAt: '2099-01-01T00:00:00.000Z',
    isOwner: true, isExpired: false, averageScore: 88, highestScore: 88,
  },
  members: [{
    memberId: '11111111-1111-4111-8111-111111111111', nickname: '奶龙本人', score: 88,
    level: '豪气冲天', type: '自在极意豪', dimensions: assessment.dimensions,
    nailoong: assessment.nailoong, compositeScore: 90, seasonPoints: 3,
    verified: true, source: 'E2E 云端模型', joinedAt: '2026-09-02T00:00:00.000Z', rank: 1, isSelf: true,
  }],
  isMember: true,
  todayTaskCompleted: false,
  dailyTask: { id: 'hard-mouth-v1', title: '用一句话证明你嘴硬', points: 3, date: '2026-09-02' },
};

async function mockApis(page) {
  await page.route('**/api/analyze', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assessment) }));
  await page.route('**/api/court', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ battle: { winner: 'B', title: '被告胜诉', reason: '被告在抽象反应上明显更离谱。' }, participants: [assessment, assessment] }) }));
  await page.route('**/api/quote', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: '不是累，只是在和世界保持合理距离。', source: 'E2E 文字模型' }) }));
  await page.route('**/api/social/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/social/session') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, nickname: '', rooms: [] }) });
    if (pathname === '/api/social/rooms' && request.method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ code: 'JH8F32A' }) });
    if (pathname === '/api/social/rooms/JH8F32A') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(roomPayload) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ completed: true, awarded: true, points: 3 }) });
  });
}

async function openSection(page, desktopName, mobileName = desktopName) {
  const mobile = page.viewportSize()?.width <= 760;
  await page.getByRole('button', { name: mobile ? mobileName : desktopName, exact: true }).click();
}

async function completeTextAssessment(page, text = '也没什么，只是习惯一个人处理。', { expectResult = true } = {}) {
  await page.getByRole('tab', { name: '文字' }).click();
  await page.getByLabel('要鉴定的文字').fill(text);
  await page.getByLabel('同意将内容用于本次娱乐分析').check();
  await page.getByRole('button', { name: /开始抽象鉴定/ }).click();
  if (expectResult) await expect(page.getByRole('heading', { name: '鉴定结果' })).toBeVisible();
}

test.describe('嘉豪鉴定所升级全链路', () => {
  test.beforeEach(async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
  });

  test('五模块导航与人格档案是正式页面', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '先别急着装正常。' })).toBeVisible();
    await openSection(page, '我的档案');
    await expect(page.getByRole('heading', { name: '人格档案' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '嘉豪物种' })).toBeVisible();
    await page.getByRole('tab', { name: '奶龙人格' }).click();
    await expect(page.getByRole('heading', { name: '淡人型奶龙豪' }).first()).toBeVisible();
  });

  test('照片、聊天和文字三种鉴定都进入双指数结果', async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('fake-image') });
    await page.getByLabel('同意将内容用于本次娱乐分析').check();
    await page.getByRole('button', { name: /开始抽象鉴定/ }).click();
    await expect(page.getByText('奶龙指数')).toBeVisible();

    await page.getByRole('button', { name: '再测一次' }).first().click();
    await page.getByRole('tab', { name: '聊天记录' }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'chat.txt', mimeType: 'text/plain', buffer: Buffer.from('roommate: fine') });
    await page.getByLabel('同意将内容用于本次娱乐分析').check();
    await page.getByRole('button', { name: /开始抽象鉴定/ }).click();
    await expect(page.getByRole('heading', { name: '淡人型奶龙豪' }).first()).toBeVisible();

    await page.getByRole('button', { name: '再测一次' }).first().click();
    await completeTextAssessment(page);
    await expect(page.getByRole('button', { name: /生成战绩卡/ })).toBeVisible();
  });

  test('云端失败明确回退为基础算法成绩并进入历史', async ({ page }) => {
    await page.unroute('**/api/analyze');
    await page.route('**/api/analyze', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '云端忙' }) }));
    await completeTextAssessment(page, '这个底层逻辑其实不复杂，懂的都懂。');
    await expect(page.getByText(/基础算法成绩/)).toBeVisible();
    await openSection(page, '我的档案');
    await expect(page.locator('.history-grid button')).toHaveCount(1);
  });

  test('抽象法庭与嘴硬翻译器形成可完成闭环', async ({ page }) => {
    await openSection(page, '抽象实验室', '实验室');
    await page.getByRole('button', { name: /抽象法庭/ }).click();
    await page.getByRole('button', { name: '立即开庭' }).click();
    await expect(page.getByText('被告胜诉')).toBeVisible();
    await page.getByRole('button', { name: /嘴硬翻译器/ }).click();
    await page.getByRole('button', { name: '开始嘴硬' }).click();
    await expect(page.getByText('不是累，只是在和世界保持合理距离。')).toBeVisible();
  });

  test('完成鉴定后可创建挑战并落到正式好友榜页面', async ({ page }) => {
    await completeTextAssessment(page);
    await page.getByRole('button', { name: /拉好友来测/ }).click();
    await expect(page).toHaveURL(/\/r\/JH8F32A$/);
    await expect(page.getByRole('heading', { name: '谁更抽象挑战' })).toBeVisible();
    await expect(page.getByText('奶龙本人 · 我')).toBeVisible();
    await expect(page.getByText(/淡人型奶龙豪 · 云端可信/)).toBeVisible();
  });

  test('未鉴定好友打开邀请后可先测并自动回房加入', async ({ page }) => {
    let joined = false;
    await page.unroute('**/api/social/**');
    await page.route('**/api/social/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname.endsWith('/join')) {
        joined = true;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ joined: true }) });
      }
      if (pathname === '/api/social/rooms/JH8F32A') return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(joined ? roomPayload : { ...roomPayload, members: [], isMember: false }),
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/r/JH8F32A');
    const assessFirst = page.getByRole('button', { name: '先完成鉴定' });
    await expect(assessFirst).toBeEnabled();
    await assessFirst.click();
    await completeTextAssessment(page, '好友打开邀请后直接完成鉴定。', { expectResult: false });
    await expect(page).toHaveURL(/\/r\/JH8F32A$/);
    await expect(page.getByText('奶龙本人 · 我')).toBeVisible();
  });

  test('390×844下首页、实验室和好友页均无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    for (const [desktop, mobile] of [['鉴定', '鉴定'], ['抽象实验室', '实验室'], ['好友战绩', '好友']]) {
      await openSection(page, desktop, mobile);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
    }
  });
});
