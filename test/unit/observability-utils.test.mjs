import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Mirror server/observability.mjs utility functions

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function integerOrNull(value) {
  const number = finiteNonNegative(value);
  return number === null ? null : Math.round(number);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function cleanPath(value) {
  const path = typeof value === 'string' ? value.trim().slice(0, 300) : '/';
  return path.startsWith('/') && !path.startsWith('/admin') ? path : '/';
}

function referrerHost(value) {
  if (!value || typeof value !== 'string') return null;
  try { return new URL(value).hostname.slice(0, 200); } catch { return null; }
}

function deviceCategory(userAgent = '') {
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  if (/mobile|android|iphone/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function number(value) {
  return Number(value || 0);
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function metric(value, previous) {
  const currentNumber = number(value);
  const previousNumber = number(previous);
  return { value: currentNumber, previous: previousNumber, change: percentChange(currentNumber, previousNumber) };
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

// ---- finiteNonNegative ----
test('finiteNonNegative returns number for valid input', () => {
  assert.equal(finiteNonNegative(42), 42);
  assert.equal(finiteNonNegative(0), 0);
  assert.equal(finiteNonNegative(3.14), 3.14);
});

test('finiteNonNegative returns null for negative', () => {
  assert.equal(finiteNonNegative(-1), null);
  assert.equal(finiteNonNegative(-0.1), null);
});

test('finiteNonNegative returns null for non-finite values', () => {
  assert.equal(finiteNonNegative(NaN), null);
  assert.equal(finiteNonNegative(Infinity), null);
  assert.equal(finiteNonNegative('abc'), null);
  assert.equal(finiteNonNegative(undefined), null);
});

test('finiteNonNegative converts null to 0 (Number(null) === 0, which is finite and >=0)', () => {
  // This matches the actual behavior: Number(null) is 0
  assert.equal(finiteNonNegative(null), 0);
});

// ---- integerOrNull ----
test('integerOrNull rounds valid input', () => {
  assert.equal(integerOrNull(3.7), 4);
  assert.equal(integerOrNull(3.2), 3);
  assert.equal(integerOrNull(0), 0);
});

test('integerOrNull returns null for truly invalid', () => {
  assert.equal(integerOrNull(-5), null);
  assert.equal(integerOrNull(NaN), null);
  assert.equal(integerOrNull(undefined), null);
});

test('integerOrNull converts null to 0 (via finiteNonNegative chain)', () => {
  // Number(null) = 0 → finiteNonNegative returns 0 → Math.round(0) = 0
  assert.equal(integerOrNull(null), 0);
});

// ---- parseCookies ----
test('parseCookies parses cookie string', () => {
  const req = { headers: { cookie: 'a=1; b=hello%20world; c=3' } };
  const result = parseCookies(req);
  assert.deepEqual(result, { a: '1', b: 'hello world', c: '3' });
});

test('parseCookies handles empty cookies', () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
  assert.deepEqual(parseCookies({ headers: { cookie: '' } }), {});
});

test('parseCookies handles missing equals sign', () => {
  const req = { headers: { cookie: 'novalue' } };
  const result = parseCookies(req);
  assert.deepEqual(result, {});
});

// ---- cleanPath ----
test('cleanPath returns valid paths as-is', () => {
  assert.equal(cleanPath('/'), '/');
  assert.equal(cleanPath('/test'), '/test');
  assert.equal(cleanPath('/api/analyze'), '/api/analyze');
});

test('cleanPath rejects admin paths', () => {
  assert.equal(cleanPath('/admin'), '/');
  assert.equal(cleanPath('/admin/overview'), '/');
});

test('cleanPath fixes non-path strings', () => {
  assert.equal(cleanPath('not-a-path'), '/');
  assert.equal(cleanPath(''), '/');
  assert.equal(cleanPath(null), '/');
  assert.equal(cleanPath(undefined), '/');
});

test('cleanPath truncates long paths', () => {
  const long = '/' + 'x'.repeat(400);
  assert.ok(cleanPath(long).length <= 300);
});

// ---- referrerHost ----
test('referrerHost extracts hostname from URL', () => {
  assert.equal(referrerHost('https://example.com/path'), 'example.com');
  assert.equal(referrerHost('http://sub.example.com:8080/page'), 'sub.example.com');
});

test('referrerHost returns null for invalid', () => {
  assert.equal(referrerHost(null), null);
  assert.equal(referrerHost(''), null);
  assert.equal(referrerHost('not-a-url'), null);
});

// ---- deviceCategory ----
test('deviceCategory detects mobile', () => {
  assert.equal(deviceCategory('iPhone; CPU iPhone OS 16'), 'mobile');
  assert.equal(deviceCategory('Android Chrome Mobile'), 'mobile');
});

test('deviceCategory detects tablet', () => {
  assert.equal(deviceCategory('iPad; CPU OS 16'), 'tablet');
});

test('deviceCategory defaults to desktop', () => {
  assert.equal(deviceCategory('Mozilla/5.0 (Windows NT 10.0'), 'desktop');
  assert.equal(deviceCategory(''), 'desktop');
});

// ---- number ----
test('number converts to Number', () => {
  assert.equal(number('5'), 5);
  assert.equal(number(10), 10);
  assert.equal(number(0), 0);
  assert.equal(number(null), 0);
  assert.equal(number(undefined), 0);
  assert.equal(number(''), 0);
});

// ---- percentChange ----
test('percentChange calculates correctly', () => {
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 100), -50);
  assert.equal(percentChange(100, 100), 0);
});

test('percentChange handles zero previous', () => {
  assert.equal(percentChange(100, 0), 100);
  assert.equal(percentChange(0, 0), 0);
});

// ---- metric ----
test('metric returns structured metric object', () => {
  const m = metric(150, 100);
  assert.equal(m.value, 150);
  assert.equal(m.previous, 100);
  assert.equal(m.change, 50);
});

// ---- hashToken ----
test('hashToken produces deterministic hex hash', () => {
  const h1 = hashToken('secret123');
  const h2 = hashToken('secret123');
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);
  assert.ok(/^[a-f0-9]{64}$/.test(h1));
});

test('hashToken different tokens produce different hashes', () => {
  assert.notEqual(hashToken('a'), hashToken('b'));
});

// ---- digest ----
test('digest produces Buffer output', () => {
  const d = digest('test');
  assert.ok(Buffer.isBuffer(d));
  assert.equal(d.length, 32);
});

test('digest is deterministic', () => {
  assert.ok(digest('test').equals(digest('test')));
});

// ---- clientKey ----
test('clientKey extracts x-forwarded-for', () => {
  const req = { headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' }, socket: {} };
  assert.equal(clientKey(req), '10.0.0.1');
});

test('clientKey uses remoteAddress as fallback', () => {
  const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientKey(req), '127.0.0.1');
});

test('clientKey returns unknown when nothing available', () => {
  const req = { headers: {}, socket: {} };
  assert.equal(clientKey(req), 'unknown');
});
