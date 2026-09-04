import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAGUE_PROMPTS,
  addLeagueScores,
  buildLeagueAwards,
  buildSeasonWindow,
  digestRecoveryCode,
  generateRecoveryCode,
  getLeaguePrompt,
  normalizeLeagueJudgement,
  normalizeLeaguePromptOverride,
  normalizeLeagueAnswer,
  rankLeagueRound,
  verifyRecoveryCode,
} from '../../server/league.mjs';

test('联赛题库包含 28 道编辑题并按嘉豪和奶龙交替', () => {
  assert.equal(LEAGUE_PROMPTS.length, 28);
  assert.equal(LEAGUE_PROMPTS[0].character, 'jiahao');
  assert.equal(LEAGUE_PROMPTS[1].character, 'nailoong');
  assert.ok(LEAGUE_PROMPTS.every((item) => item.text.length >= 8));
});

test('每日题按上海自然日稳定轮换', () => {
  const beforeMidnight = getLeaguePrompt(new Date('2026-09-04T15:59:59.000Z'));
  const afterMidnight = getLeaguePrompt(new Date('2026-09-04T16:00:00.000Z'));
  assert.equal(beforeMidnight.date, '2026-09-04');
  assert.equal(afterMidnight.date, '2026-09-05');
  assert.notEqual(beforeMidnight.id, afterMidnight.id);
});

test('赛季窗口固定七个上海自然日', () => {
  assert.deepEqual(buildSeasonWindow('2026-09-04'), {
    startDate: '2026-09-04',
    endDate: '2026-09-10',
    rawContentDeleteAfter: '2026-09-18T00:00:00.000+08:00',
  });
});

test('综合分每票加 2 且最多加 10', () => {
  assert.equal(addLeagueScores(78, 0), 78);
  assert.equal(addLeagueScores(78, 3), 84);
  assert.equal(addLeagueScores(78, 99), 88);
});

test('每日排名按5/3/2/1给分且并列共享同一档', () => {
  const rows = rankLeagueRound([
    { submissionId: 'a', aiScore: 90, voteCount: 0 },
    { submissionId: 'b', aiScore: 84, voteCount: 3 },
    { submissionId: 'c', aiScore: 87, voteCount: 0 },
    { submissionId: 'd', aiScore: 70, voteCount: 0 },
  ]);
  assert.deepEqual(rows.map(({ submissionId, rank, seasonPoints }) => ({ submissionId, rank, seasonPoints })), [
    { submissionId: 'a', rank: 1, seasonPoints: 5 },
    { submissionId: 'b', rank: 1, seasonPoints: 6 },
    { submissionId: 'c', rank: 3, seasonPoints: 2 },
    { submissionId: 'd', rank: 4, seasonPoints: 1 },
  ]);
});

test('最高票答案获得 1 分人气奖且并列时共同获得', () => {
  const rows = rankLeagueRound([
    { submissionId: 'a', aiScore: 90, voteCount: 3 },
    { submissionId: 'b', aiScore: 80, voteCount: 3 },
    { submissionId: 'c', aiScore: 79, voteCount: 1 },
  ]);
  assert.deepEqual(rows.map(({ submissionId, popularityBonus }) => ({ submissionId, popularityBonus })), [
    { submissionId: 'a', popularityBonus: 1 },
    { submissionId: 'b', popularityBonus: 1 },
    { submissionId: 'c', popularityBonus: 0 },
  ]);
});

test('赛季奖项按每次提交等权计算 AI 均分，不被票数重复放大', () => {
  const standings = [
    { memberId: 'a', nickname: '甲', seasonPoints: 8 },
    { memberId: 'b', nickname: '乙', seasonPoints: 7 },
  ];
  const rows = [
    { memberId: 'a', nickname: '甲', aiScore: 100, voteCount: 0 },
    { memberId: 'a', nickname: '甲', aiScore: 0, voteCount: 10 },
    { memberId: 'b', nickname: '乙', aiScore: 49, voteCount: 4 },
  ];
  const awards = buildLeagueAwards(standings, rows);
  assert.equal(awards.find((award) => award.key === 'champion').title, '嘉豪之神');
  assert.deepEqual(awards.find((award) => award.key === 'hardest').names, ['甲']);
  assert.deepEqual(awards.find((award) => award.key === 'popular').names, ['甲']);
});

test('联赛答案限制 2 到 120 字并拒绝联系方式和高风险内容', () => {
  assert.equal(normalizeLeagueAnswer('  我先沉默三秒，再问大家吃了没。  '), '我先沉默三秒，再问大家吃了没。');
  assert.throws(() => normalizeLeagueAnswer('好'), /至少 2 个字/);
  assert.throws(() => normalizeLeagueAnswer('a'.repeat(121)), /不能超过 120 个字/);
  assert.throws(() => normalizeLeagueAnswer('加我微信 wxid_abcdef123456'), /个人联系方式/);
  assert.throws(() => normalizeLeagueAnswer('我要杀了你全家'), /不适合公开/);
});

test('AI 判定只接受可公开结构并约束分数与文案', () => {
  assert.deepEqual(normalizeLeagueJudgement({ score: 108, tag: '嘴硬影后', verdict: '站着不动也能把场子说冷。', publishable: true }), {
    score: 100,
    tag: '嘴硬影后',
    verdict: '站着不动也能把场子说冷。',
    publishable: true,
  });
  assert.equal(normalizeLeagueJudgement({ score: 'bad', tag: '', verdict: '', publishable: false }).publishable, false);
});

test('恢复口令使用密钥摘要验证且不保存明文', () => {
  const code = generateRecoveryCode();
  const digest = digestRecoveryCode(code, 'server-secret');
  assert.match(code, /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  assert.notEqual(digest, code);
  assert.equal(verifyRecoveryCode(code.toLowerCase(), digest, 'server-secret'), true);
  assert.equal(verifyRecoveryCode(`${code}X`, digest, 'server-secret'), false);
});

test('观测台题库覆盖只接受日期、双主角和 8 到 200 字题目', () => {
  assert.deepEqual(normalizeLeaguePromptOverride({ date: '2026-09-08', character: 'nailoong', text: '  朋友突然点名你，你要怎么回？  ', active: true }), {
    date: '2026-09-08', character: 'nailoong', text: '朋友突然点名你，你要怎么回？', active: true,
  });
  assert.throws(() => normalizeLeaguePromptOverride({ date: 'tomorrow', character: 'jiahao', text: '这是一道足够长的题目' }), /日期/);
  assert.throws(() => normalizeLeaguePromptOverride({ date: '2026-09-08', character: 'other', text: '这是一道足够长的题目' }), /角色/);
  assert.throws(() => normalizeLeaguePromptOverride({ date: '2026-09-08', character: 'jiahao', text: '太短' }), /8 到 200/);
});
