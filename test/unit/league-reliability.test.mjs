import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeagueAwards, normalizeLeagueJudgement } from '../../server/league.mjs';

test('数据库形状奖项保留真实零分，跳过未判定 null', () => {
  const awards = buildLeagueAwards([
    { memberId: 'a', nickname: '甲', seasonPoints: 5 },
    { memberId: 'b', nickname: '乙', seasonPoints: 3 },
  ], [
    { member_id: 'a', nickname: '甲', ai_score: 100, vote_count: 0 },
    { member_id: 'a', nickname: '甲', ai_score: 0, vote_count: 3 },
    { member_id: 'a', nickname: '甲', ai_score: null, vote_count: 0 },
    { memberId: 'b', nickname: '乙', aiScore: 49, voteCount: 1 },
  ]);
  assert.deepEqual(awards.map(({ names }) => names), [['甲'], ['甲'], ['甲']]);
});

test('判定字段不完整不能以兜底零分冒充成功，合法零分保留', () => {
  const valid = { score: 0, tag: '还需练习', verdict: '这句还没接住现场，再换个角度。', publishable: true };
  assert.equal(normalizeLeagueJudgement(valid).score, 0);
  for (const raw of [
    { publishable: true }, { ...valid, score: null }, { ...valid, score: 'bad' },
    { ...valid, tag: '' }, { ...valid, verdict: undefined }, { ...valid, verdict: '  ' },
  ]) assert.throws(() => normalizeLeagueJudgement(raw), { code: 'LEAGUE_JUDGE_INVALID' });
});
