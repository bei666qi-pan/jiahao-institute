import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductInsights } from '../../server/observability.mjs';

test('产品漏斗按去重人数计算分步转化率', () => {
  const result = buildProductInsights([
    { event_name: 'assessment_started', events: '12', visitors: '10' },
    { event_name: 'assessment_completed', events: '9', visitors: '8' },
    { event_name: 'share_clicked', events: '5', visitors: '4' },
    { event_name: 'challenge_created', events: '3', visitors: '2' },
    { event_name: 'challenge_opened', events: '7', visitors: '6' },
    { event_name: 'friend_completed', events: '4', visitors: '3' },
  ], [], null);

  assert.deepEqual(result.assessment.map(({ event, visitors, conversion }) => ({ event, visitors, conversion })), [
    { event: 'assessment_started', visitors: 10, conversion: 100 },
    { event: 'assessment_completed', visitors: 8, conversion: 80 },
    { event: 'share_clicked', visitors: 4, conversion: 50 },
    { event: 'challenge_created', visitors: 2, conversion: 50 },
  ]);
  assert.equal(result.invite[1].conversion, 50);
});

test('玩法完成率分玩法展示且图片指标保留成功率与耗时', () => {
  const result = buildProductInsights([], [
    { game: 'reaction', started: '20', completed: '15', players: '11' },
    { game: 'image', started: '8', completed: '6', players: '5' },
  ], { requests: '10', successes: '9', p95_ms: '18200', average_latency_ms: '9300' });

  assert.deepEqual(result.games[0], { game: 'reaction', started: 20, completed: 15, players: 11, completionRate: 75 });
  assert.deepEqual(result.image, { requests: 10, successes: 9, successRate: 90, p95Ms: 18200, averageLatencyMs: 9300 });
});

test('零开始量不会产生无穷或虚假转化率', () => {
  const result = buildProductInsights([
    { event_name: 'assessment_completed', events: '2', visitors: '2' },
  ], [{ game: 'court', started: '0', completed: '2', players: '2' }], null);
  assert.equal(result.assessment[0].conversion, null);
  assert.equal(result.games[0].completionRate, null);
  assert.equal(result.image.successRate, null);
});

test('观测台视频指标按角色展示成功率与延迟', () => {
  const result = buildProductInsights([], [], null, [
    { character: 'nailoong', requests: '3', successes: '2', p95_ms: '42000', average_latency_ms: '31000' },
    { character: 'jiahao', requests: '2', successes: '2', p95_ms: '38000', average_latency_ms: '28000' },
  ]);
  assert.deepEqual(result.video, [
    { character: 'nailoong', requests: 3, successes: 2, successRate: 2 / 3 * 100, p95Ms: 42000, averageLatencyMs: 31000 },
    { character: 'jiahao', requests: 2, successes: 2, successRate: 100, p95Ms: 38000, averageLatencyMs: 28000 },
  ]);
});
