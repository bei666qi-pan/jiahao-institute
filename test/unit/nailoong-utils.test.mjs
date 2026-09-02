import test from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../../server.mjs';

const legacyResult = {
  id: '嘉豪-legacy',
  score: 76,
  type: '潜伏嘉豪',
  level: '高阶嘉豪',
  verdict: '表面说都行，细节已经替你发言。',
  dimensions: {
    mystery: 80,
    flex: 60,
    niche: 40,
    deep: 20,
    show: 50,
    language: 70,
  },
  traits: ['表面正常'],
  evidence: ['信息留白很大'],
  comment: '只是看起来随便。',
  source: '云端文字大模型',
};

test('双指数V2由固定规则生成奶龙六维并保留嘉豪兼容字段', () => {
  assert.equal(typeof server.buildAssessmentV2, 'function');
  const result = server.buildAssessmentV2(legacyResult);

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.score, 76);
  assert.equal(result.jiahao.score, 76);
  assert.deepEqual(result.nailoong.dimensions, {
    hardMouth: 70,
    deadpan: 50,
    hungerResilience: 40,
    abstractReaction: 55,
    cameraSense: 50,
    friendPrank: 55,
  });
  assert.equal(result.nailoong.score, 54);
  assert.equal(result.nailoong.archetype, '嘴硬型奶龙豪');
});

test('新鉴定的嘉豪权威分由六维规则计算而不是沿用模型自报分', () => {
  assert.equal(typeof server.calculateJiahaoScore, 'function');
  const dimensions = { mystery: 80, flex: 60, niche: 40, deep: 20, show: 50, language: 70 };
  assert.equal(server.calculateJiahaoScore(dimensions), 55);
  assert.equal(server.calculateJiahaoScore({ mystery: 8, flex: 6, niche: 4, deep: 2, show: 5, language: 7 }), 55);
});

test('旧鉴定记录升级为legacy-derived且不篡改原对象', () => {
  assert.equal(typeof server.upgradeLegacyAssessment, 'function');
  const before = structuredClone(legacyResult);
  const upgraded = server.upgradeLegacyAssessment(legacyResult);

  assert.deepEqual(legacyResult, before);
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.nailoong.source, 'legacy-derived');
  assert.equal(upgraded.jiahao.type, '潜伏嘉豪');
});

test('反应局按北京时间日期稳定返回五道不重复且不泄露权重的题', () => {
  assert.equal(typeof server.getDailyReactionChallenge, 'function');
  const first = server.getDailyReactionChallenge('2026-09-02');
  const again = server.getDailyReactionChallenge('2026-09-02');

  assert.deepEqual(first, again);
  assert.equal(first.questions.length, 5);
  assert.equal(new Set(first.questions.map((question) => question.id)).size, 5);
  assert.ok(first.questions.every((question) => question.options.length === 2));
  assert.ok(first.questions.every((question) => question.options.every((option) => !('weights' in option))));
});

test('反应局评分只接受题库内选项并按六维权重生成结果', () => {
  assert.equal(typeof server.scoreReactionAnswers, 'function');
  const challenge = server.getDailyReactionChallenge('2026-09-02');
  const answers = challenge.questions.map((question) => ({
    questionId: question.id,
    optionId: question.options[0].id,
  }));
  const result = server.scoreReactionAnswers(challenge.challengeId, answers, '2026-09-02');

  assert.equal(result.kind, 'reaction');
  assert.equal(result.challengeId, challenge.challengeId);
  assert.equal(result.answerCount, 5);
  assert.ok(result.nailoong.score >= 0 && result.nailoong.score <= 100);
  assert.deepEqual(Object.keys(result.nailoong.dimensions).sort(), [
    'abstractReaction', 'cameraSense', 'deadpan', 'friendPrank', 'hardMouth', 'hungerResilience',
  ]);
  assert.throws(
    () => server.scoreReactionAnswers(challenge.challengeId, [{ questionId: 'fake', optionId: 'fake' }], '2026-09-02'),
    /答案无效/,
  );
});

test('反应局成绩凭证可验证且无法篡改', () => {
  assert.equal(typeof server.signReactionResult, 'function');
  assert.equal(typeof server.verifyReactionResultToken, 'function');
  const challenge = server.getDailyReactionChallenge('2026-09-02');
  const answers = challenge.questions.map((question) => ({ questionId: question.id, optionId: question.options[0].id }));
  const result = server.scoreReactionAnswers(challenge.challengeId, answers, '2026-09-02');
  const token = server.signReactionResult(result, 'reaction-secret');

  assert.equal(server.verifyReactionResultToken(token, 'reaction-secret').challengeId, challenge.challengeId);
  assert.equal(server.verifyReactionResultToken(`${token}x`, 'reaction-secret'), null);
});
