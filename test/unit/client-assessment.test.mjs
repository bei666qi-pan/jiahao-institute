import test from 'node:test';
import assert from 'node:assert/strict';
import * as validation from '../../src/validation.js';

test('客户端将V1历史记录无损升级为双指数结果', () => {
  assert.equal(typeof validation.upgradeClientResult, 'function');
  const legacy = {
    id: '嘉豪-1234',
    score: 80,
    type: '潜伏嘉豪',
    level: '豪气冲天',
    dimensions: { mystery: 60, flex: 50, niche: 40, deep: 30, show: 20, language: 70 },
    evidence: ['证据一'],
  };
  const upgraded = validation.upgradeClientResult(legacy);

  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.jiahao.score, 80);
  assert.equal(upgraded.nailoong.source, 'legacy-derived');
  assert.deepEqual(legacy.dimensions, { mystery: 60, flex: 50, niche: 40, deep: 30, show: 20, language: 70 });
});

test('本地回退鉴定对相同输入稳定生成可分享双指数结果', () => {
  assert.equal(typeof validation.makeFallbackAssessment, 'function');
  const first = validation.makeFallbackAssessment('也没什么，只是习惯了。', 'text', []);
  const second = validation.makeFallbackAssessment('也没什么，只是习惯了。', 'text', []);

  assert.equal(first.schemaVersion, 2);
  assert.equal(first.source, '基础算法成绩');
  assert.equal(first.id, second.id);
  assert.equal(first.score, second.score);
  assert.equal(first.nailoong.score, second.nailoong.score);
  assert.equal(first.evidence.length, 3);
});

test('好友房公开载荷只包含结果字段且保留奶龙数据', () => {
  assert.equal(typeof validation.makeSocialResultPayload, 'function');
  const result = validation.makeFallbackAssessment('测试公开结果', 'text', []);
  const payload = validation.makeSocialResultPayload({ ...result, rawInput: '不应公开', resultToken: 'signed' });

  assert.equal(payload.resultToken, 'signed');
  assert.equal(payload.result.schemaVersion, 2);
  assert.equal(payload.result.nailoong.score, result.nailoong.score);
  assert.equal('rawInput' in payload.result, false);
  assert.equal('comment' in payload.result, false);
});
