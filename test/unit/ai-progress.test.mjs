import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiProgress } from '../../src/app/aiProgress.js';

test('estimated AI progress starts with a visible but conservative running value', () => {
  const progress = getAiProgress({ kind: 'analysis', status: 'running', startedAt: 1_000, now: 1_000 });

  assert.deepEqual(progress, {
    value: 18,
    stage: 'AI 正在分析',
    detail: '预计进度，会随等待时间缓慢推进',
    estimated: true,
  });
});

test('a provider-confirmed queue stage still labels its percentage as estimated', () => {
  const progress = getAiProgress({ kind: 'video', status: 'queued', startedAt: 1_000, now: 9_000 });

  assert.deepEqual(progress, {
    value: 14,
    stage: '任务已进入供应商队列',
    detail: '队列状态已确认；百分比为预计进度',
    estimated: true,
  });
});

test('an unfinished estimate never claims completion even after a long wait', () => {
  const progress = getAiProgress({ kind: 'image', status: 'running', startedAt: 0, now: 3_600_000 });

  assert.equal(progress.value, 90);
  assert.equal(progress.estimated, true);
});
