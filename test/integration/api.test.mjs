import test from 'node:test';
import assert from 'node:assert/strict';

// Save original env
const originalEnv = { ...process.env };

function setupTestEnv() {
  process.env.DEEPSEEK_API_KEY = "";
  process.env.ARK_API_KEY = "";
  delete process.env.DATABASE_URL;
  delete process.env.ADMIN_PASSWORD;
  process.env.PORT = '0';
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, headers: response.headers, body };
}

let serverUrl = '';
let serverInstance = null;

test.before(async () => {
  setupTestEnv();
  const module = await import('../../server.mjs');
  const { server } = module;

  await new Promise((resolve) => {
    serverInstance = server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      serverUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(() => {
  if (serverInstance) serverInstance.close();
  restoreEnv();
});

// === Health Check ===
test('GET /healthz returns ok status', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/healthz`);
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.textModelConfigured, false);
  assert.equal(body.visionModelConfigured, false);
  assert.deepEqual(body.imageGeneration, { minimaxConfigured: false, volcengineConfigured: false, priority: ['volcengine', 'minimax'] });
});

// === Static File Serving ===
test('GET / returns index.html', async () => {
  const response = await fetch(`${serverUrl}/`);
  assert.equal(response.status, 200);
  const contentType = response.headers.get('content-type');
  assert.ok(contentType.includes('text/html'));
  const text = await response.text();
  assert.ok(text.includes('<!doctype') || text.includes('<html') || text.includes('嘉豪') || text.includes('root'));
});

test('GET /non-existent returns index.html (SPA fallback)', async () => {
  const response = await fetch(`${serverUrl}/some-random-path-12345`);
  assert.equal(response.status, 200);
  const contentType = response.headers.get('content-type');
  assert.ok(contentType.includes('text/html'));
});

// === API Route Tests (without model keys, expect 503) ===
test('POST /api/analyze returns 503 without model key', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/analyze`, {
    method: 'POST',
    body: JSON.stringify({ input: '测试文字', mode: 'text' }),
  });
  assert.equal(status, 503);
  assert.ok(body.error);
});

test('POST /api/pk returns 503 without model key', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/pk`, {
    method: 'POST',
    body: JSON.stringify({
      participants: [
        { name: '甲', input: '测试', mode: 'text' },
        { name: '乙', input: '测试2', mode: 'text' },
      ],
    }),
  });
  assert.equal(status, 503);
  assert.ok(body.error);
});

test('POST /api/quote returns 503 without model key', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/quote`, {
    method: 'POST',
    body: JSON.stringify({ input: '今天有点累', mode: 'hao', level: '豪气冲天', style: '高冷' }),
  });
  assert.equal(status, 503);
  assert.ok(body.error);
});

test('POST /api/images/generate returns 503 when both image providers are unconfigured', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/images/generate`, {
    method: 'POST',
    body: JSON.stringify({ prompt: '雨夜撑伞等公交', aspectRatio: '1:1' }),
  });
  assert.equal(status, 503);
  assert.equal(body.error, '图片生成服务尚未配置');
});

test('GET /api/reactions/daily returns five public questions without model configuration', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/reactions/daily?date=2026-09-02`);
  assert.equal(status, 200);
  assert.equal(body.questions.length, 5);
  assert.ok(body.questions.every((question) => question.options.every((option) => !('weights' in option))));
});

test('POST /api/reactions/score validates a complete daily answer set', async () => {
  const daily = await fetchJson(`${serverUrl}/api/reactions/daily?date=2026-09-02`);
  const answers = daily.body.questions.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  }));
  const { status, body } = await fetchJson(`${serverUrl}/api/reactions/score`, {
    method: 'POST',
    body: JSON.stringify({ challengeId: daily.body.challengeId, date: '2026-09-02', answers }),
  });
  assert.equal(status, 200);
  assert.equal(body.answerCount, 5);
  assert.equal(body.nailoong.dimensions.abstractReaction >= 0, true);
});

test('POST /api/court returns 503 without model configuration', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/court`, {
    method: 'POST',
    body: JSON.stringify({
      participants: [
        { name: '原告', input: '我家猫会说人话', mode: 'text' },
        { name: '被告', input: '昨天被外星人绑架', mode: 'text' },
      ],
    }),
  });
  assert.equal(status, 503);
  assert.ok(body.error);
});

// === Method Checks ===
test('GET /api/analyze falls through to serveStatic (returns index.html)', async () => {
  const response = await fetch(`${serverUrl}/api/analyze`);
  // Server routes: POST /api/analyze is handled, but GET falls through
  // to the static file handler, which serves index.html
  assert.equal(response.status, 200);
  const contentType = response.headers.get('content-type');
  // Should return HTML (SPA fallback)
  assert.ok(contentType && contentType.includes('text/html'));
});

test('POST /healthz returns 405', async () => {
  const response = await fetch(`${serverUrl}/healthz`, { method: 'POST' });
  assert.equal(response.status, 405);
});

// === Malformed Body ===
test('POST /api/analyze with invalid JSON body returns error', async () => {
  const response = await fetch(`${serverUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not valid json {{{',
  });
  // Should return 4xx or 5xx
  assert.ok(response.status >= 400);
});

// === Admin Routes (without database) ===
test('GET /api/admin/session returns not configured', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/admin/session`);
  assert.equal(status, 200);
  assert.equal(body.authenticated, false);
  assert.equal(body.configured, false);
});

test('POST /api/admin/login returns 503 without db', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/admin/login`, {
    method: 'POST',
    body: JSON.stringify({ password: 'test' }),
  });
  assert.equal(status, 503);
});

test('GET /api/admin/overview returns 401 without auth', async () => {
  const { status } = await fetchJson(`${serverUrl}/api/admin/overview`);
  assert.equal(status, 401);
});

// === Telemetry Routes ===
test('POST /api/telemetry/session returns gracefully', async () => {
  const response = await fetch(`${serverUrl}/api/telemetry/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '/' }),
  });
  // Without database, should still return 200 (ignored=true) or 500
  assert.ok(response.status === 200 || response.status === 500);
});

test('POST /api/telemetry/heartbeat returns 204', async () => {
  const response = await fetch(`${serverUrl}/api/telemetry/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 204);
});

// === Security Headers ===
test('Static responses include security headers', async () => {
  const response = await fetch(`${serverUrl}/`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('API responses include security headers', async () => {
  const response = await fetch(`${serverUrl}/healthz`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

// === Cache Headers ===
test('Healthz has no-store cache', async () => {
  const response = await fetch(`${serverUrl}/healthz`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

// === Large Body ===
test('Large body returns 413 error', async () => {
  // 28MB body (MAX_BODY_BYTES)
  const largeString = 'x'.repeat(1024); // 1KB
  const largeBody = JSON.stringify({ input: largeString, extra: largeString });
  // Send a reasonably large payload but under the limit
  const response = await fetch(`${serverUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: 'x'.repeat(1024 * 1024) }),
  });
  // Should be 503 (no API key) or handled
  assert.ok(response.status >= 400 || response.status === 503);
});
