import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
let app;
let appUrl;
let model;
let closeResources;
let modelCalls = 0;

function cookieFrom(response) {
  return response.headers.get('set-cookie')?.split(';')[0] || '';
}

async function request(path, { cookie = '', method = 'GET', body } = {}) {
  const response = await fetch(`${appUrl}${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { response, body: await response.json() };
}

test.before(async () => {
  if (!enabled) return;
  model = createServer(async (req, res) => {
    for await (const _chunk of req) { /* consume request */ }
    modelCalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ score: 86, tag: '气氛接管者', verdict: '一句落下，群聊立刻重新开机。', publishable: true }) } }],
      usage: { prompt_tokens: 32, completion_tokens: 18 },
    }));
  });
  await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_SSL = 'false';
  process.env.LEAGUE_RECOVERY_SECRET = 'local-integration-recovery-secret';
  process.env.MINIMAX_TEXT_API_KEY = 'local-integration-key';
  process.env.MINIMAX_TEXT_BASE_URL = `http://127.0.0.1:${model.address().port}`;
  process.env.MINIMAX_TEXT_MODEL = 'integration-model';
  ({ server: app, closeSocialResources: closeResources } = await import('../../social-server.mjs'));
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  appUrl = `http://127.0.0.1:${app.address().port}`;
});

test.after(async () => {
  if (!enabled) return;
  await new Promise((resolve) => app.close(resolve));
  await closeResources();
  await new Promise((resolve) => model.close(resolve));
});

test('真实数据库中三方权限、交卷解锁与改投链路成立', { skip: !enabled }, async () => {
  const created = await request('/api/social/rooms', {
    method: 'POST',
    body: { roomType: 'league', name: '真实数据库联赛', nickname: '房主', memberLimit: 12 },
  });
  assert.equal(created.response.status, 201);
  const ownerCookie = cookieFrom(created.response);
  const code = created.body.code;

  const preview = await request(`/api/social/rooms/${code}`);
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.isMember, false);
  assert.deepEqual(preview.body.entries, []);
  const guestCookie = cookieFrom(preview.response);

  const joined = await request(`/api/social/rooms/${code}/join`, { cookie: guestCookie, method: 'POST', body: { nickname: '好友甲' } });
  assert.equal(joined.response.status, 200);
  const beforeAnswer = await request(`/api/social/rooms/${code}`, { cookie: guestCookie });
  assert.deepEqual(beforeAnswer.body.entries, []);

  const ownerKey = crypto.randomUUID();
  const ownerSubmissions = await Promise.all([
    request(`/api/social/rooms/${code}/league/submit`, { cookie: ownerCookie, method: 'POST', body: { answer: '我只是让沉默先说两句。', idempotencyKey: ownerKey } }),
    request(`/api/social/rooms/${code}/league/submit`, { cookie: ownerCookie, method: 'POST', body: { answer: '我只是让沉默先说两句。', idempotencyKey: ownerKey } }),
  ]);
  assert.deepEqual(ownerSubmissions.map((item) => item.response.status), [200, 200]);
  assert.equal(modelCalls, 1);
  const guestSubmit = await request(`/api/social/rooms/${code}/league/submit`, { cookie: guestCookie, method: 'POST', body: { answer: '别急，气氛正在更新版本。', idempotencyKey: crypto.randomUUID() } });
  assert.equal(guestSubmit.response.status, 200);

  const unlocked = await request(`/api/social/rooms/${code}`, { cookie: ownerCookie });
  assert.equal(unlocked.body.entries.length, 2);
  const guestEntry = unlocked.body.entries.find((entry) => !entry.isSelf);
  const voted = await request(`/api/social/rooms/${code}/league/vote`, { cookie: ownerCookie, method: 'POST', body: { submissionId: guestEntry.submissionId } });
  assert.equal(voted.response.status, 200);
  assert.equal(voted.body.entries.find((entry) => entry.submissionId === guestEntry.submissionId).voteCount, 1);

  const selfVote = await request(`/api/social/rooms/${code}/league/vote`, { cookie: ownerCookie, method: 'POST', body: { submissionId: unlocked.body.entries.find((entry) => entry.isSelf).submissionId } });
  assert.equal(selfVote.response.status, 400);
});
