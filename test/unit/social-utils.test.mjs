import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareRoomMembers,
  getDailyRoomTask,
  pointsForBattleOutcome,
  signSocialResult,
  verifySocialResultToken,
} from '../../server/social.mjs';

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

test('好友房每日任务按北京时间日期稳定轮换', () => {
  assert.deepEqual(getDailyRoomTask('2026-09-02'), getDailyRoomTask('2026-09-02'));
  assert.notEqual(getDailyRoomTask('2026-09-02').id, getDailyRoomTask('2026-09-03').id);
  assert.ok(getDailyRoomTask('2026-09-02').title.length > 4);
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

test('V2成绩凭证保留奶龙指数与赛季积分所需公开字段', () => {
  const v2Result = {
    ...result,
    schemaVersion: 2,
    nailoong: {
      score: 91,
      level: '奶龙显形',
      archetype: '淡人型奶龙豪',
      dimensions: {
        hardMouth: 66,
        deadpan: 90,
        hungerResilience: 58,
        abstractReaction: 91,
        cameraSense: 66,
        friendPrank: 92,
      },
    },
  };

  const token = signSocialResult(v2Result, 'test-social-secret');
  const verified = verifySocialResultToken(token, 'test-social-secret');

  assert.equal(verified.schemaVersion, 2);
  assert.equal(verified.nailoong.score, 91);
  assert.equal(verified.nailoong.archetype, '淡人型奶龙豪');
  assert.equal(verified.compositeScore, 90);
});

test('好友榜固定按可信成绩、赛季积分、双指数均分和加入时间排序', () => {
  const members = [
    { member_id: 'late', verified: true, season_points: 6, composite_score: 80, joined_at: '2026-09-02T03:00:00Z' },
    { member_id: 'local', verified: false, season_points: 99, composite_score: 99, joined_at: '2026-09-02T01:00:00Z' },
    { member_id: 'strong', verified: true, season_points: 6, composite_score: 92, joined_at: '2026-09-02T02:00:00Z' },
    { member_id: 'points', verified: true, season_points: 9, composite_score: 70, joined_at: '2026-09-02T04:00:00Z' },
  ];

  assert.deepEqual(members.toSorted(compareRoomMembers).map((item) => item.member_id), ['points', 'strong', 'late', 'local']);
});

test('挑战积分遵循胜利2分，落败完成或平局1分', () => {
  assert.deepEqual(pointsForBattleOutcome('A'), { challenger: 2, opponent: 1 });
  assert.deepEqual(pointsForBattleOutcome('B'), { challenger: 1, opponent: 2 });
  assert.deepEqual(pointsForBattleOutcome('tie'), { challenger: 1, opponent: 1 });
});
