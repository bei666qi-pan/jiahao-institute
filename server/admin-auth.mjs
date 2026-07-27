import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookie, hashToken, parseCookies } from './observability.mjs';

const ADMIN_COOKIE = 'jh_admin';
const SESSION_SECONDS = 12 * 60 * 60;
const attempts = new Map();

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

export function safePasswordEqual(provided, expected) {
  return timingSafeEqual(digest(provided), digest(expected));
}

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function currentAttempt(req, now = Date.now()) {
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
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export async function loginAdmin(req, observability, password) {
  if (!observability.enabled) return { status: 503, body: { error: '观测数据库尚未配置' } };
  if (!password) return { status: 503, body: { error: '后台访问密码尚未配置' } };
  if (!sameOrigin(req)) return { status: 403, body: { error: '请求来源无效' } };
  const attempt = currentAttempt(req);
  if (attempt.count >= 5) return { status: 429, body: { error: '尝试次数过多，请稍后再试' } };
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) return { status: 413, body: { error: '请求内容过大' } };
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return { status: 400, body: { error: '请求格式无效' } }; }
  if (!safePasswordEqual(body?.password || '', password)) {
    attempt.count += 1;
    return { status: 401, body: { error: '密码不正确，请重试' } };
  }
  attempts.delete(clientKey(req));
  const token = randomBytes(32).toString('base64url');
  await observability.query(`insert into jh_admin_sessions (token_hash, expires_at)
    values ($1, now() + interval '12 hours')`, [hashToken(token)]);
  return {
    status: 200,
    body: { authenticated: true, expiresIn: SESSION_SECONDS },
    cookies: [cookie(ADMIN_COOKIE, token, SESSION_SECONDS, req, 'Strict')],
  };
}

export async function verifyAdmin(req, observability) {
  if (!observability.enabled) return false;
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (!token || token.length > 100) return false;
  const result = await observability.query(`update jh_admin_sessions set last_seen_at = now()
    where token_hash = $1 and revoked_at is null and expires_at > now() returning expires_at`, [hashToken(token)]);
  return result.rowCount > 0;
}

export async function logoutAdmin(req, observability) {
  if (!sameOrigin(req)) return { status: 403, body: { error: '请求来源无效' } };
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (token && observability.enabled) await observability.query('update jh_admin_sessions set revoked_at = now() where token_hash = $1', [hashToken(token)]);
  return {
    status: 200,
    body: { authenticated: false },
    cookies: [cookie(ADMIN_COOKIE, '', 0, req, 'Strict')],
  };
}

export function clearLoginAttemptsForTests() { attempts.clear(); }
