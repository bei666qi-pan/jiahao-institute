import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Observability } from '../../server/observability.mjs';
import { SocialService } from '../../server/social.mjs';
import { createLeagueJudge } from '../../server/league.mjs';

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const env = { DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_SSL: 'false' };
const judged = (score) => ({ data: { score, tag: '现场接招', verdict: '这句接住了具体情境，让朋友也想接话。', publishable: true } });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test.before(async () => {
  if (!enabled) return;
  const store = new Observability(env);
  try { await store.init(); } finally { await store.pool.end(); }
});

async function fixture(t, judge = async () => judged(50)) {
  let now = new Date('2026-09-04T15:59:55Z');
  const service = new SocialService(env, 'isolated-test-secret', { now: () => now, judgeLeagueAnswer: judge });
  const visitors = [randomUUID(), randomUUID(), randomUUID()];
  const { code } = await service.createLeagueRoom(visitors[0], { name: '隔离竞态验证', nickname: '甲' });
  const context = await service.getLeagueContext(code, visitors[0]);
  const initial = await service.leagueRoom(code, visitors[0]);
  assert.equal(initial.round.date, '2026-09-04');
  assert.equal(initial.season.endDate, '2026-09-10');
  for (const [index, visitor] of visitors.slice(1).entries()) await service.joinLeagueRoom(code, visitor, { nickname: ['乙', '丙'][index] });
  t.after(async () => {
    await service.query('delete from jh_rooms where code=$1', [code]);
    await service.query('delete from jh_social_profiles where visitor_id=any($1::uuid[])', [visitors]);
    await service.query('delete from jh_league_unlocks where visitor_id=any($1::uuid[])', [visitors]);
    await service.pool.end();
  });
  return { service, visitors, code, context, setNow: (value) => { now = new Date(value); },
    submit: (index, answer) => service.submitLeagueAnswer(code, visitors[index], { answer, idempotencyKey: randomUUID() }) };
}

test('真实数据库：两份判定跨午夜完成后均补计，并重算已结算名次', { skip: !enabled, timeout: 15000 }, async (t) => {
  const release = deferred();
  const started = deferred();
  let waiting = 0;
  const f = await fixture(t, async ({ answer }) => {
    if (answer !== '先完成的答案') { if (++waiting === 2) started.resolve(); await release.promise; }
    return judged(answer === '先完成的答案' ? 50 : answer === '最高分的答案' ? 90 : 80);
  });
  await f.submit(0, '先完成的答案');
  const pending = [f.submit(1, '最高分的答案'), f.submit(2, '第二名的答案')];
  await started.promise;
  f.setNow('2026-09-04T16:00:01Z');
  await f.service.finalizeLeagueRounds(f.context.room.room_id);
  release.resolve();
  await Promise.all(pending);
  const rows = await f.service.query('select ai_score, finalized_points from jh_league_submissions where round_id=$1 order by ai_score desc', [f.context.round.round_id]);
  assert.deepEqual(rows.rows, [{ ai_score: 90, finalized_points: 5 }, { ai_score: 80, finalized_points: 3 }, { ai_score: 50, finalized_points: 2 }]);
  await f.service.finalizeLeagueRounds(f.context.room.room_id);
  const again = await f.service.query('select ai_score, finalized_points from jh_league_submissions where round_id=$1 order by ai_score desc', [f.context.round.round_id]);
  assert.deepEqual(again.rows, rows.rows);
});

test('真实数据库：投票读取旧上下文后跨日锁榜，不得补写昨日票', { skip: !enabled, timeout: 15000 }, async (t) => {
  const f = await fixture(t);
  await f.submit(0, '甲今天的答案'); await f.submit(1, '乙今天的答案');
  const room = await f.service.leagueRoom(f.code, f.visitors[0]);
  const target = room.entries.find((entry) => !entry.isSelf).submissionId;
  const reached = deferred(); const release = deferred();
  const realContext = f.service.getLeagueContext.bind(f.service);
  f.service.getLeagueContext = async (...args) => {
    const result = await realContext(...args);
    f.service.getLeagueContext = realContext;
    reached.resolve(); await release.promise;
    return result;
  };
  const voting = f.service.voteLeagueAnswer(f.code, f.visitors[0], { submissionId: target });
  const rejected = assert.rejects(voting, (error) => error.statusCode === 403);
  await reached.promise;
  f.setNow('2026-09-04T16:00:01Z');
  await f.service.finalizeLeagueRounds(f.context.room.room_id);
  release.resolve();
  await rejected;
  const votes = await f.service.query('select * from jh_league_votes where round_id=$1', [f.context.round.round_id]);
  assert.equal(votes.rowCount, 0);
});

test('真实数据库：不完整模型判定保存失败状态，原句可重判且合法零分成功', { skip: !enabled, timeout: 15000 }, async (t) => {
  let output = { publishable: true };
  const judge = createLeagueJudge({ MINIMAX_TEXT_API_KEY: 'fixture', MINIMAX_TEXT_BASE_URL: 'http://fixture.invalid', MINIMAX_TEXT_MODEL: 'fixture' }, async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) }));
  const f = await fixture(t, judge);
  await assert.rejects(() => f.submit(0, '这句原话必须保留'), { code: 'LEAGUE_JUDGE_PENDING' });
  const failed = await f.service.leagueRoom(f.code, f.visitors[0]);
  assert.equal(failed.round.judgementStatus, 'failed');
  assert.equal(failed.round.hasSubmitted, false);
  assert.deepEqual(failed.entries, []);
  const saved = await f.service.query('select answer_text, ai_score from jh_league_submissions where submission_id=$1', [failed.round.submissionId]);
  assert.deepEqual(saved.rows, [{ answer_text: '这句原话必须保留', ai_score: null }]);
  output = judged(0).data;
  const ready = await f.service.retryLeagueJudgement(f.code, f.visitors[0], { submissionId: failed.round.submissionId });
  assert.equal(ready.round.hasSubmitted, true);
  assert.equal(ready.entries[0].aiScore, 0);
});

test('真实数据库：七日结束返回冠军、最高均分与最高票奖项', { skip: !enabled, timeout: 15000 }, async (t) => {
  const f = await fixture(t, async ({ answer }) => judged(answer === '甲的接梗答案' ? 90 : 0));
  await f.submit(0, '甲的接梗答案'); await f.submit(1, '乙的接梗答案');
  const room = await f.service.leagueRoom(f.code, f.visitors[0]);
  await f.service.voteLeagueAnswer(f.code, f.visitors[0], { submissionId: room.entries.find((entry) => !entry.isSelf).submissionId });
  f.setNow('2026-09-10T16:00:01Z');
  const finished = await f.service.leagueRoom(f.code, f.visitors[0]);
  assert.equal(finished.season.status, 'finished');
  assert.deepEqual(finished.awards, [
    { key: 'champion', title: '嘉豪之神', names: ['甲'] },
    { key: 'hardest', title: '最佳嘴硬', names: ['甲'] },
    { key: 'popular', title: '最受欢迎', names: ['乙'] },
  ]);
});
