import assert from 'node:assert/strict';
import test from 'node:test';
import { createSignedEcsRequest, rebootInstance } from '../../scripts/volcengine-ecs-control.mjs';

const env = {
  VOLC_AK: 'test-access-key',
  VOLC_SK: 'test-secret-key',
  VOLC_REGION: 'cn-shanghai',
};

test('ECS signer never exposes the secret key and signs deterministic requests', () => {
  const input = {
    action: 'DescribeInstances',
    query: { 'InstanceIds.1': 'i-test' },
    env,
    now: new Date('2026-07-28T08:00:00Z'),
  };
  const first = createSignedEcsRequest(input);
  const second = createSignedEcsRequest(input);
  assert.deepEqual(first, second);
  assert.match(first.options.headers.Authorization, /^HMAC-SHA256 Credential=test-access-key\//);
  assert.equal(JSON.stringify(first).includes(env.VOLC_SK), false);
  assert.match(first.url, /Action=DescribeInstances/);
});

test('reboot guard rejects an instance inside the cooldown window', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    ResponseMetadata: { RequestId: 'test' },
    Result: {
      Instances: [{
        InstanceId: 'i-test',
        InstanceName: 'test',
        Status: 'RUNNING',
        UpdatedAt: '2026-07-28T07:50:00Z',
      }],
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    rebootInstance('i-test', {
      fetchImpl,
      env,
      now: new Date('2026-07-28T08:00:00Z'),
      cooldownMinutes: 20,
    }),
    /cooldown 20m/,
  );
});

test('reboot guard rejects instances that are not running', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    Result: {
      Instances: [{
        InstanceId: 'i-test',
        InstanceName: 'test',
        Status: 'REBOOTING',
        UpdatedAt: '2026-07-28T06:00:00Z',
      }],
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  await assert.rejects(
    rebootInstance('i-test', {
      fetchImpl,
      env,
      now: new Date('2026-07-28T08:00:00Z'),
    }),
    /current status is REBOOTING/,
  );
});
