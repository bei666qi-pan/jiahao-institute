import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductEvent } from '../../server/observability.mjs';

test('增长事件仅接受固定漏斗事件和非内容型属性', () => {
  assert.deepEqual(normalizeProductEvent({
    name: 'assessment_completed',
    properties: {
      mode: 'text',
      source: '基础算法成绩',
      roomType: 'challenge',
      roomCode: 'SECRET',
      rawText: '这段用户原文绝不能入库',
    },
  }), {
    name: 'assessment_completed',
    properties: { mode: 'text', source: '基础算法成绩', roomType: 'challenge' },
  });
});

test('未知增长事件会被拒绝', () => {
  assert.equal(normalizeProductEvent({ name: 'record_everything', properties: {} }), null);
});
