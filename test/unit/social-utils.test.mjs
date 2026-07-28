import test from 'node:test';
import assert from 'node:assert/strict';
import { signSocialResult, verifySocialResultToken } from '../../server/social.mjs';

const result = {
  score: 88,
  level: '豪气冲天',
  type: '小众优越豪',
  dimensions: { mystery: 80, flex: 72, niche: 94, deep: 68, show: 77, language: 86 },
  source: '云端多模态大模型',
};

test('好友榜云端成绩凭证可签发并验证', () => {
  const token = signSocialResult(result, 'test-social-secret');
  assert.equal(typeof token, 'string');
  const verified = verifySocialResultToken(token, 'test-social-secret');
  assert.equal(verified.verified, true);
  assert.equal(verified.score, 88);
  assert.equal(verified.type, '小众优越豪');
  assert.deepEqual(verified.dimensions, result.dimensions);
});

test('被篡改或使用错误密钥的成绩凭证会被拒绝', () => {
  const token = signSocialResult(result, 'test-social-secret');
  assert.equal(verifySocialResultToken(`${token}x`, 'test-social-secret'), null);
  assert.equal(verifySocialResultToken(token, 'other-secret'), null);
});

test('签名时会约束公开字段范围与分数边界', () => {
  const token = signSocialResult({ ...result, score: 999, type: '未知物种' }, 'test-social-secret');
  const verified = verifySocialResultToken(token, 'test-social-secret');
  assert.equal(verified.score, 100);
  assert.equal(verified.type, '潜伏嘉豪');
});
