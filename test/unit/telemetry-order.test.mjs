import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetryTransport } from '../../src/telemetry.js';

test('产品事件会等待匿名会话建立后再发送', async () => {
  const calls = [];
  let finishSession;
  const send = (path) => {
    calls.push(path);
    if (path === '/api/telemetry/session') return new Promise((resolve) => { finishSession = resolve; });
    return Promise.resolve({ ok: true });
  };
  const transport = createTelemetryTransport(send);
  transport.recordSession({ path: '/' });
  const event = transport.recordEvent({ name: 'assessment_started' });

  assert.deepEqual(calls, ['/api/telemetry/session']);
  finishSession({ ok: true });
  await event;
  assert.deepEqual(calls, ['/api/telemetry/session', '/api/telemetry/event']);
});

test('会话写入失败不会永久阻塞后续产品事件', async () => {
  const calls = [];
  const transport = createTelemetryTransport((path) => {
    calls.push(path);
    return path.endsWith('/session') ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true });
  });
  await transport.recordSession({ path: '/' });
  await transport.recordEvent({ name: 'assessment_started' });
  assert.deepEqual(calls, ['/api/telemetry/session', '/api/telemetry/event']);
});
