import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('release health gate rejects unhealthy and exited applications', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
  const condition = workflow.match(/if (\[\[ "\$\{app_status\}"[^\n]+); then/)[1];
  for (const [status, expected] of [['running:healthy', 0], ['running:unhealthy', 1], ['exited:healthy', 1], ['exited:unhealthy', 1]]) {
    const result = spawnSync('bash', ['-c', condition], { env: { ...process.env, app_status: status } });
    assert.equal(result.status, expected, status);
  }
});
