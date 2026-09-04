import test from 'node:test';
import assert from 'node:assert/strict';
import { Observability } from '../../server/observability.mjs';

const enabled = Boolean(process.env.TEST_DATABASE_URL);

test('真实 PostgreSQL 可生成后台概览与按日成本统计', { skip: !enabled }, async () => {
  const observability = new Observability({
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    DATABASE_SSL: 'false',
  });

  try {
    await observability.init();
    const overview = await observability.overview('7d');
    const costs = await observability.costs('7d');

    assert.equal(overview.range, '7d');
    assert.equal(costs.range, '7d');
    assert.deepEqual(costs.unavailableBreakdowns, []);
  } finally {
    await observability.pool?.end();
  }
});
