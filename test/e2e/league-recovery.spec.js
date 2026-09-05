import { test, expect } from '@playwright/test';

const room = (memberId = '11111111-1111-4111-8111-111111111111', date = '2026-09-04') => ({
  room: { code: 'H7K9P2Q', name: '恢复验证联赛', roomType: 'league', memberCount: 2, memberLimit: 12, status: 'active' },
  member: { memberId, nickname: '小龙' }, isMember: true,
  season: { number: 1, startDate: '2026-09-04', endDate: '2026-09-10', status: 'active', day: 1 },
  round: { date, promptId: 'league-prompt-v2-01', mode: '接梗局', character: 'jiahao', prompt: '室友群里有人问最后洗澡的人怎么接梗？', goal: '接住朋友的话', twist: '最多 18 个字', angles: ['一本正经'], status: 'open', hasSubmitted: false },
  entries: [], standings: [], unlocks: [],
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/telemetry/**', route => route.fulfill({ status: 202, contentType: 'application/json', body: '{}' }));
});

async function submit(page, answer) {
  await page.getByLabel('今日答案').fill(answer);
  await page.getByLabel('同意联赛答案公开规则').check();
  await page.getByRole('button', { name: '预览交卷' }).click();
  await page.getByRole('button', { name: '确认交卷' }).click();
}

test('交卷503后读取真实失败状态，重判使用答案ID且成功后清理草稿', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let phase = 'open'; let retryBody;
  const submissionId = '22222222-2222-4222-8222-222222222222';
  await page.route('**/api/social/rooms/H7K9P2Q**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/submit')) {
      phase = 'failed';
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'AI 暂时没判完，答案已保留，可稍后重试', code: 'LEAGUE_JUDGE_PENDING' }) });
    }
    if (path.endsWith('/retry')) {
      retryBody = route.request().postDataJSON(); phase = 'ready';
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    const body = room();
    body.round = { ...body.round, judgementStatus: phase === 'open' ? null : phase, submissionId: phase === 'open' ? null : submissionId, hasSubmitted: phase === 'ready' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/r/H7K9P2Q');
  await submit(page, '最后洗的负责叫醒太阳');
  await expect(page.getByRole('button', { name: '重试 AI 判定' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('server-confirmed-retry.png'), fullPage: true });
  await page.getByRole('button', { name: '重试 AI 判定' }).click();
  await expect(page.getByText('今天已交卷', { exact: true })).toBeVisible();
  expect(retryBody).toEqual({ submissionId });
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('jiahao-league-draft:v1:')))).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('未落库失败保留原句，刷新与原输入重试沿用幂等键，草稿不串成员房间或日期', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let memberId = '11111111-1111-4111-8111-111111111111'; let date = '2026-09-04'; const submitted = [];
  await page.route('**/api/social/rooms/**', async route => {
    if (route.request().url().endsWith('/submit')) {
      submitted.push(route.request().postDataJSON());
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: '这段内容不适合公开到好友房', code: 'LEAGUE_CONTENT_BLOCKED' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(room(memberId, date)) });
  });
  await page.goto('/r/H7K9P2Q');
  await submit(page, '我们只是让闹钟加个班');
  await expect(page.getByLabel('今日答案')).toHaveValue('我们只是让闹钟加个班');
  await page.reload();
  await expect(page.getByLabel('今日答案')).toHaveValue('我们只是让闹钟加个班');
  await page.screenshot({ path: testInfo.outputPath('draft-restored.png'), fullPage: true });
  await submit(page, '我们只是让闹钟加个班');
  await expect(page.getByLabel('今日答案')).toBeVisible();
  expect(submitted).toHaveLength(2);
  expect(submitted[0].idempotencyKey).toBe(submitted[1].idempotencyKey);
  memberId = '33333333-3333-4333-8333-333333333333'; await page.reload();
  await expect(page.getByLabel('今日答案')).toHaveValue('');
  memberId = '11111111-1111-4111-8111-111111111111'; date = '2026-09-05'; await page.reload();
  await expect(page.getByLabel('今日答案')).toHaveValue('');
  date = '2026-09-04'; await page.goto('/r/Q2K9P7H');
  await expect(page.getByLabel('今日答案')).toHaveValue('');
  await page.goto('/r/H7K9P2Q');
  await expect(page.getByLabel('今日答案')).toHaveValue('我们只是让闹钟加个班');
  expect(pageErrors).toEqual([]);
});
