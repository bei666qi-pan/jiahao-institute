import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareRoomMembers,
  dateKey,
  getDailyRoomTask,
  pointsForBattleOutcome,
  SocialService,
  signSocialResult,
  verifySocialResultToken,
} from '../../server/social.mjs';

test('数据库 DATE 对象稳定还原为赛季日期', () => {
  assert.equal(dateKey(new Date('2026-09-04T00:00:00.000Z')), '2026-09-04');
  assert.equal(dateKey('2026-09-04'), '2026-09-04');
});

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

test('联赛原句和投票身份会保留完整七天后才清理', async () => {
  const service = new SocialService({}, 'test-secret');
  service.enabled = true;
  const statements = [];
  service.query = async (sql) => { statements.push(sql.replace(/\s+/g, ' ').trim()); return { rowCount: 0, rows: [] }; };
  await service.maintain();
  const cleanup = statements.filter((sql) => sql.includes('jh_league_submissions') || sql.includes('jh_league_votes'));
  assert.equal(cleanup.length, 2);
  assert.ok(cleanup.every((sql) => sql.includes("end_date < (now() at time zone 'Asia/Shanghai')::date - 7")));
});

test('跨日锁榜后的失败答案仍能按原题重判并重算当天积分', async () => {
  const roundId = '11111111-1111-4111-8111-111111111111';
  const memberId = '22222222-2222-4222-8222-222222222222';
  const submissionId = '33333333-3333-4333-8333-333333333333';
  const seasonId = '44444444-4444-4444-8444-444444444444';
  const roomId = '55555555-5555-4555-8555-555555555555';
  const statements = [];
  const client = {
    query: async (sql) => {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      statements.push(normalized);
      if (normalized.includes("s.judge_status in ('pending','failed')")) return { rowCount: 1, rows: [{ submission_id: submissionId, answer_text: '昨天的答案', judge_status: 'failed', member_id: memberId, round_id: roundId, prompt_text: '昨天的问题', character: 'jiahao', round_status: 'finished', season_id: seasonId, room_id: roomId }] };
      if (normalized.includes('pg_try_advisory_lock')) return { rowCount: 1, rows: [{ locked: true }] };
      if (normalized.includes('where submission_id=$1') && normalized.startsWith('select submission_id')) return { rowCount: 1, rows: [{ submission_id: submissionId, answer_text: '昨天的答案', judge_status: 'failed' }] };
      if (normalized.includes('select count(*)::int count')) return { rowCount: 1, rows: [{ count: 1 }] };
      if (normalized.startsWith('select s.submission_id, s.ai_score')) return { rowCount: 1, rows: [{ submission_id: submissionId, ai_score: 91, vote_count: 0 }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const service = new SocialService({}, 'test-secret', {
    judgeLeagueAnswer: async (input) => {
      assert.deepEqual(input, { prompt: '昨天的问题', answer: '昨天的答案', character: 'jiahao' });
      return { data: { score: 91, tag: '补判王者', verdict: '迟到的分数仍然算数。', publishable: true } };
    },
  });
  service.pool = { connect: async () => client };
  service.leagueRoom = async () => ({ ok: true });
  assert.deepEqual(await service.retryLeagueJudgement('ABC234', 'visitor-1', { submissionId }), { ok: true });
  assert.ok(statements.some((sql) => sql.includes("judge_status='ready'")));
  assert.ok(statements.some((sql) => sql.includes('finalized_points=$2')));
});
