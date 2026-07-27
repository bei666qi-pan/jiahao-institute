import test from 'node:test';
import assert from 'node:assert/strict';
import { decideFallbackWinner, validateFiles } from '../src/validation.js';
import { normalizePkResult, normalizeResult, validImages } from '../server.mjs';

const image = (name = 'selfie.jpg', size = 1024) => ({ name, size, type: 'image/jpeg' });

test('photo mode accepts one image and rejects documents', () => {
  assert.equal(validateFiles([image()], { mode: 'photo' }).length, 1);
  assert.throws(() => validateFiles([{ name: 'chat.pdf', size: 1024, type: 'application/pdf' }], { mode: 'photo' }), /照片仅支持/);
});

test('chat mode enforces count and 10MB limit', () => {
  assert.equal(validateFiles([{ name: 'chat.docx', size: 1024, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]).length, 1);
  assert.throws(() => validateFiles([image('1.jpg'), image('2.jpg'), image('3.jpg'), image('4.jpg')]), /最多选择 3/);
  assert.throws(() => validateFiles([image('large.jpg', 10 * 1024 * 1024 + 1)]), /超过 10MB/);
});

test('fallback PK uses a two-point tie window', () => {
  assert.equal(decideFallbackWinner(70, 69), 'tie');
  assert.equal(decideFallbackWinner(73, 70), 'A');
  assert.equal(decideFallbackWinner(66, 70), 'B');
});

test('single result normalization clamps unsafe model output', () => {
  const result = normalizeResult({ score: 180, type: '不存在', dimensions: { mystery: -10 } });
  assert.equal(result.score, 100);
  assert.equal(result.type, '潜伏嘉豪');
  assert.equal(result.dimensions.mystery, 0);
});

test('PK normalization preserves two names and validates winner', () => {
  const result = normalizePkResult({ participants: [{ score: 80 }, { score: 75 }], battle: { winner: 'other' } }, ['甲', '乙'], '模型综合裁决');
  assert.deepEqual(result.participants.map((item) => item.name), ['甲', '乙']);
  assert.equal(result.battle.winner, 'tie');
  assert.equal(result.battle.source, '模型综合裁决');
});

test('image payload validation filters malformed data and caps count', () => {
  const valid = 'data:image/jpeg;base64,AA==';
  assert.equal(validImages([valid, 'https://example.com/a.jpg', valid], 1).length, 1);
});
