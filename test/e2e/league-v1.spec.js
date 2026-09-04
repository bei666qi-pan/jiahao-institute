import { test, expect } from '@playwright/test';

const baseRoom = {
  room: { code: 'H7K9P2Q', name: '测试抽象联赛', roomType: 'league', memberLimit: 12, memberCount: 2, isOwner: false, status: 'active' },
  season: { number: 1, startDate: '2026-09-04', endDate: '2026-09-10', status: 'active', day: 1 },
  round: { date: '2026-09-04', promptId: 'league-prompt-v2-01', character: 'jiahao', mode: '接梗局', prompt: '宿舍群里有人发：“今晚谁最后洗澡，谁就是明天的闹钟。”你怎么接？', goal: '让人一眼看懂，并忍不住继续接你的梗。', twist: '最多 18 个字', angles: ['一本正经', '顺势加码', '反客为主'], status: 'open', hasSubmitted: false },
  privacy: '答案仅赛季内的房间成员可见，赛季结束 7 天后删除原句。',
  unlocks: [],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/telemetry/**', route => route.fulfill({ status: 202, contentType: 'application/json', body: '{}' }));
});

test('首页把七日好友联赛作为唯一主行动', async ({ page }) => {
  await page.route('**/api/social/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, leagueEnabled: true, rooms: [] }) }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '每天一句，七天决出嘉豪之神' })).toBeVisible();
  await expect(page.getByRole('button', { name: '创建 7 日好友联赛' })).toBeVisible();
  await expect(page.getByRole('button', { name: '测测我有多豪' })).not.toBeVisible();
});

test('手机首屏文案首帧可读且不以长时间空白入场', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/social/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, leagueEnabled: true, rooms: [] }) }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const opacity = await page.locator('.league-first-hero .hao-hero-copy').evaluate((element) => Number(getComputedStyle(element).opacity));
  const photoOpacity = await page.locator('.league-first-hero .hao-hero-media').evaluate((element) => Number(getComputedStyle(element).opacity));
  expect(opacity).toBeGreaterThanOrEqual(0.85);
  expect(photoOpacity).toBeGreaterThanOrEqual(0.65);
});

test('平板双栏首屏长标题不会挤进人物图', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.route('**/api/social/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, leagueEnabled: true, rooms: [] }) }));
  await page.goto('/');

  const titleFits = await page.locator('.league-first-hero h1 span:last-child').evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(titleFits).toBe(true);
});

test('邀请链接允许免鉴定加入、交卷后看答案并投票', async ({ page }) => {
  let joined = false;
  let submitted = false;
  let voted = false;
  await page.route('**/api/social/rooms/H7K9P2Q**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/join')) {
      joined = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ joined: true, firstJoin: true, recoveryCode: 'ABCD-EFGH-JKLM-NPQR' }) });
    }
    if (request.method() === 'POST' && path.endsWith('/league/submit')) {
      submitted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
    if (request.method() === 'POST' && path.endsWith('/league/vote')) {
      voted = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    }
    const body = {
      ...baseRoom,
      isMember: joined,
      member: joined ? { memberId: '11111111-1111-4111-8111-111111111111', nickname: '小龙' } : null,
      round: { ...baseRoom.round, hasSubmitted: submitted },
      entries: submitted ? [
        { submissionId: '22222222-2222-4222-8222-222222222222', nickname: '小龙', answer: '我只是给沉默一个发言的机会。', aiScore: 88, tag: '冷场掌门', verdict: '话没多说，气氛已经被承包。', voteCount: 0, isSelf: true, isVoted: false, totalScore: 88, provisionalRank: 1 },
        { submissionId: '33333333-3333-4333-8333-333333333333', nickname: '阿豪', answer: '我以为大家在等我总结。', aiScore: 82, tag: '总结大师', verdict: '人还没开口，总结已经到了。', voteCount: voted ? 1 : 0, isSelf: false, isVoted: voted, totalScore: voted ? 84 : 82, provisionalRank: 2 },
      ] : [],
      standings: joined ? [{ rank: 1, memberId: '11111111-1111-4111-8111-111111111111', nickname: '小龙', seasonPoints: 0, daysPlayed: submitted ? 1 : 0, isSelf: true }] : [],
    };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/r/H7K9P2Q');
  await page.getByLabel('联赛昵称').fill('小龙');
  await page.getByRole('button', { name: '加入联赛' }).click();
  await expect(page.getByText('ABCD-EFGH-JKLM-NPQR')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '七日赛季进度' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '七日赛季进度' }).locator('[aria-current="step"]')).toContainText('今天');
  await expect(page.getByText('接梗局', { exact: true })).toBeVisible();
  await expect(page.getByText('今天怎么豪')).toBeVisible();
  await expect(page.getByText('本局加码：最多 18 个字')).toBeVisible();
  const angle = page.getByRole('button', { name: '一本正经' });
  await angle.click();
  await expect(angle).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('今日答案').fill('我只是给沉默一个发言的机会。');
  await page.getByLabel('同意联赛答案公开规则').check();
  await page.getByRole('button', { name: '预览交卷' }).click();
  await page.getByRole('button', { name: '确认交卷' }).click();
  await expect(page.getByText('阿豪')).toBeVisible();
  await page.getByRole('button', { name: '投阿豪一票' }).click();
  await expect(page.getByRole('button', { name: '已投阿豪' })).toBeVisible();
});

test('联赛房在手机上保持单列且没有横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/social/rooms/H7K9P2Q**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...baseRoom,
      isMember: true,
      member: { memberId: '11111111-1111-4111-8111-111111111111', nickname: '小龙' },
      standings: [{ rank: 1, memberId: '11111111-1111-4111-8111-111111111111', nickname: '小龙', seasonPoints: 0, daysPlayed: 0, isSelf: true }],
      entries: [],
    }),
  }));
  await page.goto('/r/H7K9P2Q');
  await expect(page.getByRole('navigation', { name: '七日赛季进度' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('原页面直接开启下一季时会生成新的交卷幂等凭据', async ({ page }) => {
  let phase = 'first';
  const keys = [];
  await page.route('**/api/social/rooms/H7K9P2Q**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path.endsWith('/league/submit')) {
      keys.push((await request.postDataJSON()).idempotencyKey);
      phase = phase === 'first' ? 'finished' : 'second-submitted';
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (request.method() === 'POST' && path.endsWith('/league/next-season')) {
      phase = 'second';
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    const finished = phase === 'finished';
    const second = phase === 'second' || phase === 'second-submitted';
    const body = {
      ...baseRoom,
      room: { ...baseRoom.room, isOwner: true },
      isMember: true,
      member: { memberId: '11111111-1111-4111-8111-111111111111', nickname: '小龙' },
      season: { ...baseRoom.season, number: second ? 2 : 1, status: finished ? 'finished' : 'active' },
      round: { ...baseRoom.round, date: second ? '2026-09-11' : '2026-09-04', hasSubmitted: phase === 'second-submitted' },
      entries: [], standings: [], awards: finished ? [{ key: 'champion', title: '嘉豪之神', names: ['小龙'] }] : [],
    };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/r/H7K9P2Q');
  for (const answer of ['第一季一句话', '第二季一句话']) {
    await page.getByLabel('今日答案').fill(answer);
    await page.getByLabel('同意联赛答案公开规则').check();
    await page.getByRole('button', { name: '预览交卷' }).click();
    await page.getByRole('button', { name: '确认交卷' }).click();
    if (keys.length === 1) await page.getByRole('button', { name: '原群开启下一季' }).click();
  }
  expect(keys).toHaveLength(2);
  expect(keys[0]).not.toBe(keys[1]);
});
