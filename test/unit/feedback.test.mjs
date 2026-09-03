import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFeedback } from '../../server/feedback.mjs';

test('意见反馈只保留可审计字段并限制长度', () => {
  assert.deepEqual(normalizeFeedback({ category: 'experience', message: '  切换角色很流畅  ', contact: ' test@example.com ', ignored: 'x' }), {
    category: 'experience', message: '切换角色很流畅', contact: 'test@example.com',
  });
  assert.equal(normalizeFeedback({ category: 'unknown', message: '建议'.repeat(500) }).category, 'other');
  assert.equal(normalizeFeedback({ message: '建议'.repeat(500) }).message.length, 1000);
  assert.throws(() => normalizeFeedback({ message: 'a' }), /至少输入两个字/);
});
