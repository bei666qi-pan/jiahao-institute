import { createHmac, timingSafeEqual } from 'node:crypto';
import { makeNailoongProfile } from './nailoong.mjs';

export function signReactionResult(result, secret) {
  if (!secret || result?.kind !== 'reaction' || !result?.challengeId || !result?.nailoong) return null;
  const payload = Buffer.from(JSON.stringify({
    kind: 'reaction',
    challengeId: String(result.challengeId).slice(0, 48),
    date: String(result.date || '').slice(0, 10),
    nailoong: makeNailoongProfile(result.nailoong.dimensions, 'reaction-rules-v1'),
    issuedAt: Date.now(),
  }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyReactionResultToken(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.kind !== 'reaction' || !parsed.issuedAt || Date.now() - Number(parsed.issuedAt) > 8 * 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch { return null; }
}
