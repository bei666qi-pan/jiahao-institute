import test from 'node:test';
import assert from 'node:assert/strict';
import { activeDeltaSeconds, calculateEstimatedCost, decodeCursor, encodeCursor, getRangeConfig, Observability, parseUsage } from '../server/observability.mjs';
import { safePasswordEqual, sameOrigin } from '../server/admin-auth.mjs';

test('provider usage accepts OpenAI-compatible and cached token fields', () => {
  assert.deepEqual(parseUsage({ prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 300 } }), {
    inputTokens: 1000, outputTokens: 200, cachedInputTokens: 300,
  });
  assert.deepEqual(parseUsage(null), { inputTokens: null, outputTokens: null, cachedInputTokens: null });
});

test('cost calculation uses CNY per million token rates without floating money storage', () => {
  const cost = calculateEstimatedCost(
    { prompt_tokens: 1000, completion_tokens: 200, prompt_cache_hit_tokens: 300 },
    { input: 2, output: 8, cachedInput: .5 },
  );
  assert.equal(cost.estimatedCostMicros, 3150);
  assert.equal(cost.pricingConfigured, true);
  assert.equal(calculateEstimatedCost({ prompt_tokens: 100, completion_tokens: 20 }, {}).estimatedCostMicros, null);
});

test('active heartbeat time is bounded and never negative', () => {
  assert.equal(activeDeltaSeconds('2026-07-27T00:00:00Z', '2026-07-27T00:00:15Z'), 15);
  assert.equal(activeDeltaSeconds('2026-07-27T00:00:00Z', '2026-07-27T00:02:00Z'), 30);
  assert.equal(activeDeltaSeconds('2026-07-27T00:01:00Z', '2026-07-27T00:00:00Z'), 0);
});

test('range selection is whitelisted and includes an equal previous period', () => {
  const now = new Date('2026-07-27T00:00:00Z');
  const range = getRangeConfig('7d', now);
  assert.equal(range.bucket, 'day');
  assert.equal(range.end - range.start, range.start - range.previousStart);
  assert.equal(getRangeConfig('invalid', now).key, '7d');
});

test('opaque cursors round-trip and reject malformed input', () => {
  const cursor = encodeCursor(['2026-07-27T00:00:00Z', 42]);
  assert.deepEqual(decodeCursor(cursor), ['2026-07-27T00:00:00Z', 42]);
  assert.equal(decodeCursor('not-a-cursor'), null);
});

test('admin password comparison and same-origin check are deterministic', () => {
  assert.equal(safePasswordEqual('correct horse', 'correct horse'), true);
  assert.equal(safePasswordEqual('wrong', 'correct horse'), false);
  assert.equal(sameOrigin({ headers: { origin: 'https://jiahao.example', host: 'jiahao.example' } }), true);
  assert.equal(sameOrigin({ headers: { origin: 'https://evil.example', host: 'jiahao.example' } }), false);
});

test('cost analysis keeps usable breakdowns when one aggregation fails', async () => {
  const observability = new Observability({});
  let queryIndex = 0;
  observability.query = async () => {
    queryIndex += 1;
    if (queryIndex === 2) throw new Error('provider aggregation failed');
    return { rows: [{ requests: '2', priced_requests: '1', estimated_cost_micros: '1200' }] };
  };
  const result = await observability.costs('7d');
  assert.equal(result.partial, true);
  assert.deepEqual(result.unavailableBreakdowns, ['provider']);
  assert.equal(result.byDay.length, 1);
  assert.deepEqual(result.byProvider, []);
  assert.equal(result.byEndpoint.length, 1);
  assert.ok(result.generatedAt);
});

test('cost analysis still surfaces a real database outage', async () => {
  const observability = new Observability({});
  observability.query = async () => { throw new Error('database offline'); };
  await assert.rejects(() => observability.costs('7d'), /database offline/);
});
