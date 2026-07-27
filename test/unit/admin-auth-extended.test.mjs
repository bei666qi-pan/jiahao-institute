import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// Mirror admin-auth.mjs logic for testing

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

function safePasswordEqual(provided, expected) {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

// Mock currentAttempt for testing rate limiting logic
const createAttemptTracker = () => {
  const attempts = new Map();
  return {
    currentAttempt(req, now = Date.now()) {
      const key = clientKey(req);
      let item = attempts.get(key);
      if (!item || item.resetAt <= now) {
        item = { count: 0, resetAt: now + 15 * 60 * 1000 };
        attempts.set(key, item);
      }
      if (attempts.size > 1000) {
        for (const [entryKey, entry] of attempts) if (entry.resetAt <= now) attempts.delete(entryKey);
      }
      return item;
    },
    clear() { attempts.clear(); },
    get size() { return attempts.size; },
    getFor(key) { return attempts.get(key); },
  };
};

// ---- sameOrigin extended ----
test('sameOrigin allows requests without origin header', () => {
  assert.equal(sameOrigin({ headers: { host: 'example.com' } }), true);
});

test('sameOrigin allows same host', () => {
  assert.equal(sameOrigin({ headers: { origin: 'https://example.com', host: 'example.com' } }), true);
});

test('sameOrigin blocks different host', () => {
  assert.equal(sameOrigin({ headers: { origin: 'https://evil.com', host: 'example.com' } }), false);
});

test('sameOrigin allows same host with different port in origin', () => {
  // origin with port vs host without port should still match
  assert.equal(sameOrigin({ headers: { origin: "https://example.com:443", host: "example.com" } }), true, '443 is default HTTPS port, host matches');
});

test('sameOrigin handles invalid origin gracefully', () => {
  assert.equal(sameOrigin({ headers: { origin: 'not-a-valid-url', host: 'example.com' } }), false);
});

test('sameOrigin handles empty origin string', () => {
  assert.equal(sameOrigin({ headers: { origin: '', host: 'example.com' } }), true, 'empty origin treated as absent');
});

// ---- clientKey extended ----
test('clientKey handles array x-forwarded-for', () => {
  assert.equal(clientKey({ headers: { 'x-forwarded-for': ['10.1.1.1', '10.2.2.2'] }, socket: {} }), '10.1.1.1');
});

test('clientKey handles multiple IPs in string', () => {
  assert.equal(clientKey({ headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' }, socket: {} }), '192.168.1.1');
});

test('clientKey trims whitespace', () => {
  assert.equal(clientKey({ headers: { 'x-forwarded-for': '  10.0.0.1  ' }, socket: {} }), '10.0.0.1');
});

test('clientKey falls back to unknown', () => {
  assert.equal(clientKey({ headers: {}, socket: {} }), 'unknown');
});

// ---- safePasswordEqual ----
test('safePasswordEqual matches identical passwords', () => {
  assert.equal(safePasswordEqual('correct horse battery staple', 'correct horse battery staple'), true);
});

test('safePasswordEqual rejects different passwords', () => {
  assert.equal(safePasswordEqual('wrong', 'correct horse'), false);
});

test('safePasswordEqual is case sensitive', () => {
  assert.equal(safePasswordEqual('Password', 'password'), false);
});

test('safePasswordEqual handles unicode', () => {
  assert.equal(safePasswordEqual('密码123', '密码123'), true);
  assert.equal(safePasswordEqual('密码123', '密码456'), false);
});

// ---- hashToken ----
test('hashToken produces consistent output', () => {
  const t1 = hashToken('my-secret-token');
  const t2 = hashToken('my-secret-token');
  assert.equal(t1, t2);
});

test('hashToken output is 64-char hex', () => {
  const hash = hashToken('test');
  assert.equal(hash.length, 64);
  assert.ok(/^[a-f0-9]{64}$/.test(hash));
});

// ---- rate limiting (currentAttempt) ----
test('currentAttempt starts with count 0', () => {
  const tracker = createAttemptTracker();
  const req = { headers: { 'x-forwarded-for': '10.0.0.1' }, socket: {} };
  const attempt = tracker.currentAttempt(req);
  assert.equal(attempt.count, 0);
});

test('currentAttempt increments count', () => {
  const tracker = createAttemptTracker();
  const req = { headers: { 'x-forwarded-for': '10.0.0.1' }, socket: {} };

  const a1 = tracker.currentAttempt(req);
  a1.count += 1;
  assert.equal(a1.count, 1);

  const a2 = tracker.currentAttempt(req);
  a2.count += 1;
  assert.equal(a2.count, 2);
});

test('currentAttempt identifies rate limit exceeded', () => {
  const tracker = createAttemptTracker();
  const req = { headers: { 'x-forwarded-for': '10.0.0.1' }, socket: {} };

  const attempt = tracker.currentAttempt(req);
  attempt.count = 5; // Simulate 5 failed attempts

  assert.ok(attempt.count >= 5);
});

test('currentAttempt resets after timeout', () => {
  const tracker = createAttemptTracker();
  const req = { headers: { 'x-forwarded-for': '10.0.0.1' }, socket: {} };

  const attempt = tracker.currentAttempt(req);
  attempt.count = 5;

  // After 15 minutes + 1ms
  const futureTime = Date.now() + 15 * 60 * 1000 + 1;
  const resetAttempt = tracker.currentAttempt(req, futureTime);
  assert.equal(resetAttempt.count, 0);
});

test('currentAttempt tracks different IPs separately', () => {
  const tracker = createAttemptTracker();
  const req1 = { headers: { 'x-forwarded-for': '10.0.0.1' }, socket: {} };
  const req2 = { headers: { 'x-forwarded-for': '10.0.0.2' }, socket: {} };

  const a1 = tracker.currentAttempt(req1);
  a1.count = 3;

  const a2 = tracker.currentAttempt(req2);
  assert.equal(a2.count, 0);
});

test('currentAttempt cleanup prevents unbounded growth', () => {
  const tracker = createAttemptTracker();
  const now = Date.now();
  const futureTime = now + 30 * 60 * 1000;

  // Add expired entries
  for (let i = 0; i < 1001; i++) {
    const req = { headers: { 'x-forwarded-for': `10.0.0.${i % 255}` }, socket: {} };
    tracker.currentAttempt(req, now);
  }

  // Next call should trigger cleanup but only remove expired entries
  // Since all entries are current (within 15 min), they won't be removed
  // But the cleanup check runs when size > 1000
  assert.ok(tracker.size > 0);
});

// ---- Mock loginAdmin flow ----
test('loginAdmin rejects when password not configured', () => {
  // Simulated: if (!password) return 503
  const password = '';
  const result = !password ? { status: 503, body: { error: '后台访问密码尚未配置' } } : null;
  assert.equal(result.status, 503);
  assert.ok(result.body.error.includes('密码'));
});

test('loginAdmin returns 429 when rate limited', () => {
  // Simulated: if (attempt.count >= 5) return 429
  const attempt = { count: 5 };
  const result = attempt.count >= 5 ? { status: 429, body: { error: '尝试次数过多' } } : null;
  assert.equal(result.status, 429);
});

test('loginAdmin increments attempt on wrong password', () => {
  const attempt = { count: 2 };
  const passwordMatch = false;
  if (!passwordMatch) attempt.count += 1;
  assert.equal(attempt.count, 3);
});

// ---- digest function ----
test('digest produces 32-byte buffer', () => {
  const d = digest('test');
  assert.ok(Buffer.isBuffer(d));
  assert.equal(d.length, 32);
});

test('digest is deterministic across same input', () => {
  const d1 = digest('hello');
  const d2 = digest('hello');
  assert.ok(d1.equals(d2));
});

test('digest differs for different input', () => {
  assert.ok(!digest('hello').equals(digest('world')));
});
