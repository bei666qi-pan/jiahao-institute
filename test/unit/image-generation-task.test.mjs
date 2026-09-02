import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_GENERATION_REQUEST_TIMEOUT_MS, createImageGenerationTask } from '../../src/app/imageGenerationTask.js';

test('the browser request outlives a primary timeout plus fallback generation', () => {
  assert.equal(IMAGE_GENERATION_REQUEST_TIMEOUT_MS, 240_000);
});

test('图片生成任务在没有页面订阅时仍会完成并保留结果', async () => {
  let finish;
  const request = () => new Promise((resolve) => { finish = resolve; });
  const task = createImageGenerationTask(request);
  const states = [];
  const unsubscribe = task.subscribe(() => states.push(task.getSnapshot().status));

  const pending = task.start({ prompt: '雨夜等公交', scene: 'cinematic', aspectRatio: '3:4' });
  assert.equal(task.getSnapshot().status, 'running');
  unsubscribe();
  finish({ id: 'img-1', imageUrl: 'https://img.example/1.jpg', provider: 'minimax', aspectRatio: '3:4' });
  await pending;

  assert.equal(task.getSnapshot().status, 'complete');
  assert.equal(task.getSnapshot().result.id, 'img-1');
  assert.deepEqual(states, ['running']);
});

test('已有图片正在生成时不会重复发起请求', async () => {
  let calls = 0;
  let finish;
  const task = createImageGenerationTask(() => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  });

  const first = task.start({ prompt: '第一张' });
  const second = task.start({ prompt: '第二张' });
  assert.equal(calls, 1);
  assert.equal(first, second);
  finish({ id: 'img-2', imageUrl: 'https://img.example/2.jpg' });
  await first;
});

test('失败任务给出可重试状态且不会丢失原始选项', async () => {
  const task = createImageGenerationTask(async () => { throw new Error('限流'); });
  await assert.rejects(() => task.start({ prompt: '电梯社死', scene: 'awkward', aspectRatio: '1:1' }), /限流/);
  assert.equal(task.getSnapshot().status, 'error');
  assert.equal(task.getSnapshot().input.scene, 'awkward');
  assert.equal(task.getSnapshot().message, '限流');
});
