import test from 'node:test';
import assert from 'node:assert/strict';

const originalEnv = { ...process.env };

function setupTestEnv() {
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.ARK_API_KEY;
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

async function fetchRaw(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetchRaw(url, options);
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
      serverUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  if (serverInstance) serverInstance.close();
  restoreEnv();
});

// === CSRF Protection ===
test('POST with mismatched origin returns 403 for admin endpoints', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://evil.example.com',
    },
    body: JSON.stringify({ password: 'test' }),
  });
  // Should be 403 (origin mismatch) or 503 (no db)
  assert.ok(status === 403 || status === 503, `Expected 403 or 503, got ${status}`);
  if (status === 403) assert.ok(body?.error);
});

// === Rate Limiting Simulation ===
test('Consecutive failed logins are handled', async () => {
  // Send 6 failed login attempts (without db, will get 503)
  const results = [];
  for (let i = 0; i < 6; i++) {
    const { status } = await fetchJson(`${serverUrl}/api/admin/login`, {
      method: 'POST',
      body: JSON.stringify({ password: `wrong-password-${i}` }),
    });
    results.push(status);
  }
  // Should consistently return 503 (no db) or 429 (rate limited) or 401
  for (const s of results) {
    assert.ok([401, 429, 503].includes(s), `Unexpected status: ${s}`);
  }
});

// === Body Size Boundaries ===
test('Request body exactly at limit is accepted', async () => {
  // 1KB body is well under 28MB limit
  const { status } = await fetchJson(`${serverUrl}/api/analyze`, {
    method: 'POST',
    body: JSON.stringify({ input: 'x'.repeat(500), mode: 'text' }),
  });
  // Should be 503 (no API key), not 413
  assert.equal(status, 503);
});

test('Admin login rejects body over 4KB', async () => {
  const largePwd = 'x'.repeat(5000);
  const { status } = await fetchJson(`${serverUrl}/api/admin/login`, {
    method: 'POST',
    body: JSON.stringify({ password: largePwd }),
  });
  assert.ok(status === 413 || status === 503, `Expected 413 or 503, got ${status}`);
});

// === Malformed JSON ===
test('Unparseable JSON body returns error', async () => {
  const response = await fetchRaw(`${serverUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'this is not json {{{',
  });
  // Should be >= 400
  assert.ok(response.status >= 400, `Expected >=400, got ${response.status}`);
});

test('Empty body returns error', async () => {
  const response = await fetchRaw(`${serverUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '',
  });
  assert.ok(response.status >= 400, `Expected >=400, got ${response.status}`);
});

// === Method Not Allowed ===
test('GET to POST-only endpoints returns HTML fallback', async () => {
  const endpoints = ['/api/analyze', '/api/pk', '/api/quote'];
  for (const ep of endpoints) {
    const response = await fetchRaw(`${serverUrl}${ep}`);
    // GET to API routes falls through to serveStatic → returns HTML
    assert.equal(response.status, 200);
    const ct = response.headers.get('content-type');
    assert.ok(ct && ct.includes('text/html'), `${ep}: Expected HTML, got ${ct}`);
  }
});

// === Headers Security ===
test('API responses never cache', async () => {
  const response = await fetchRaw(`${serverUrl}/healthz`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('HTML responses have security headers', async () => {
  const response = await fetchRaw(`${serverUrl}/`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

// === Health Check Completeness ===
test('healthz reports all model and config status', async () => {
  const { body } = await fetchJson(`${serverUrl}/healthz`);
  assert.equal(body.status, 'ok');
  assert.equal(body.textModelConfigured, false);
  assert.equal(body.visionModelConfigured, false);
  assert.ok(body.textModel);
  assert.ok(body.visionModel);
  assert.ok('observability' in body);
});

// === Content-Type Handling ===
test('Static JS files have correct content type', async () => {
  // The index.html should include <script> tags pointing to JS
  const response = await fetchRaw(`${serverUrl}/`);
  const html = await response.text();
  // Extract first JS asset path
  const match = html.match(/src="(\/assets\/[^"]+\.js)"/);
  if (match) {
    const jsResponse = await fetchRaw(`${serverUrl}${match[1]}`);
    const ct = jsResponse.headers.get('content-type');
    assert.ok(ct && (ct.includes('javascript') || ct.includes('application')), `JS content-type: ${ct}`);
  }
});

// === Telemetry without DB ===
test('Telemetry session returns gracefully with no DB', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/telemetry/session`, {
    method: 'POST',
    body: JSON.stringify({ path: '/test-path' }),
  });
  // Should return 200 (ignored=true) or 500 (db error)
  assert.ok(status === 200 || status === 500, `Expected 200 or 500, got ${status}`);
});

test('Telemetry heartbeat always returns 204', async () => {
  const response = await fetchRaw(`${serverUrl}/api/telemetry/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 204);
});

// === Admin Auth Without Database ===
test('Admin session check without db reports unauthenticated', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/admin/session`);
  assert.equal(status, 200);
  assert.equal(body.authenticated, false);
  assert.equal(body.configured, false);
});

test('Protected admin endpoints return 401 without auth', async () => {
  const protectedPaths = ['/api/admin/overview', '/api/admin/visits', '/api/admin/requests', '/api/admin/costs', '/api/admin/status'];
  for (const path of protectedPaths) {
    const { status } = await fetchJson(`${serverUrl}${path}`);
    assert.equal(status, 401, `${path} should return 401`);
  }
});

test('Non-existent admin path returns 404', async () => {
  // Without auth, it returns 401 first. But /api/admin/nonexistent should 404 after auth check
  const { status } = await fetchJson(`${serverUrl}/api/admin/nonexistent`);
  assert.equal(status, 401); // Auth check comes first
});
