// UI screenshot harness for visual review of the concept-alignment pass.
// Usage: node scripts/ui-screenshot.mjs  (expects the app on http://127.0.0.1:8080)
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.UI_SHOT_BASE || 'http://127.0.0.1:8080';
const OUT = fileURLToPath(new URL('../test-results/ui-shots/', import.meta.url));

const shots = [
  { name: 'home-desktop', width: 1440, height: 900, page: 'home' },
  { name: 'quote-desktop', width: 1440, height: 900, page: 'quote' },
  { name: 'result-desktop', width: 1440, height: 900, page: 'result' },
  { name: 'social-desktop', width: 1440, height: 900, page: 'social' },
  { name: 'home-mobile', width: 390, height: 844, page: 'home', mobile: true },
  { name: 'quote-mobile', width: 390, height: 844, page: 'quote', mobile: true },
  { name: 'result-mobile', width: 390, height: 844, page: 'result', mobile: true },
  { name: 'social-mobile', width: 390, height: 844, page: 'social', mobile: true },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

const roomPayload = {
  room: {
    code: 'JH8F32A', name: '404 宿舍豪气榜', roomType: 'dorm', memberLimit: 8,
    memberCount: 4, allowPk: true, status: 'active', expiresAt: '2099-01-01T00:00:00.000Z',
    isOwner: true, isExpired: false, averageScore: 86, highestScore: 97,
  },
  members: [
    { memberId: '11111111-1111-4111-8111-111111111111', nickname: '浩宇', score: 97, level: '自在极意豪', type: '自在极意豪', dimensions: {}, verified: true, source: 'demo', joinedAt: '2026-07-28T00:00:00.000Z', rank: 1, isSelf: false },
    { memberId: '22222222-2222-4222-8222-222222222222', nickname: '嘉豪本人', score: 94, level: '豪气冲天', type: '美式嘉豪', dimensions: {}, verified: true, source: 'demo', joinedAt: '2026-07-28T00:00:00.000Z', rank: 2, isSelf: false },
    { memberId: '33333333-3333-4333-8333-333333333333', nickname: '小陈同学', score: 91, level: '豪气冲天', type: '计算机嘉豪', dimensions: {}, verified: true, source: 'demo', joinedAt: '2026-07-28T00:00:00.000Z', rank: 3, isSelf: true },
    { memberId: '44444444-4444-4444-8444-444444444444', nickname: '李想', score: 82, level: '高阶嘉豪', type: '潜伏嘉豪', dimensions: {}, verified: false, source: 'demo', joinedAt: '2026-07-28T00:00:00.000Z', rank: 4, isSelf: false },
  ],
  isMember: true,
};

async function mockSocialApis(page) {
  await page.route('**/api/social/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/social/session') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, nickname: '', rooms: [] }) });
    }
    if (pathname === '/api/social/rooms' && request.method() === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ code: 'JH8F32A' }) });
    }
    if (pathname === '/api/social/rooms/JH8F32A') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(roomPayload) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

for (const shot of shots) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    isMobile: !!shot.mobile,
    hasTouch: !!shot.mobile,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  if (shot.page === 'social') await mockSocialApis(page);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('.hero h1').waitFor({ timeout: 15_000 });

  if (shot.page === 'quote') {
    await page.getByRole('button', { name: '语录生成器', exact: true }).click();
    await page.getByLabel('要转换的原句').fill('今天有点累。');
    await page.getByRole('button', { name: /生成嘉豪语录/ }).click();
    await page.waitForTimeout(1200);
  }

  if (shot.page === 'result' || shot.page === 'social') {
    await page.getByRole('tab', { name: '文字鉴定' }).click();
    await page.getByText('我同意将内容发送至云端大模型做娱乐分析').click();
    await page.getByLabel('输入一句最有感觉的话').fill('也没什么，只是一个人习惯了。');
    await page.getByRole('button', { name: /开始鉴定/ }).click();
    await page.locator('.result-page').waitFor({ timeout: 12_000 });
    await page.waitForTimeout(1500);
  }

  if (shot.page === 'social') {
    await page.getByRole('button', { name: '创建好友豪气榜' }).click();
    await page.getByLabel('你的公开昵称').waitFor({ timeout: 8_000 });
    await page.getByLabel('你的公开昵称').fill('小陈同学');
    await page.getByLabel('榜单名称').fill('404 宿舍豪气榜');
    await page.getByLabel('房间类型').selectOption('dorm');
    await page.getByRole('button', { name: '创建并成为榜主' }).click();
    await page.getByRole('heading', { name: '404 宿舍豪气榜' }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(900);
  }

  await page.waitForTimeout(shot.page === 'home' ? 2600 : 600);
  await page.screenshot({ path: `${OUT}${shot.name}.png` });
  if (shot.page === 'home') {
    await page.screenshot({ path: `${OUT}${shot.name}-full.png`, fullPage: true });
  }
  await context.close();
  console.log(`shot: ${shot.name}`);
}

await browser.close();
console.log(`done -> ${OUT}`);
