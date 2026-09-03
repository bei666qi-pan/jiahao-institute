import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaGenerationTask } from '../../src/app/mediaGenerationTask.js';

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    value: (key) => values.get(key),
  };
}

test('图片任务保留角色媒介身份并进入成功态', async () => {
  const task = createMediaGenerationTask({
    generateImage: async (input) => ({ id: 'img-1', character: input.character, mediaType: 'image', imageUrl: '/done.webp' }),
  });
  const result = await task.start({ mediaType: 'image', character: 'jiahao', prompt: '蓝色片场' });
  assert.equal(result.character, 'jiahao');
  assert.equal(task.getSnapshot().status, 'succeeded');
  assert.equal(task.getSnapshot().mediaType, 'image');
});

test('视频任务只持久化恢复所需信息且终态停止轮询', async () => {
  const storage = memoryStorage();
  const waits = [];
  const task = createMediaGenerationTask({
    createVideo: async () => ({ id: '11111111-1111-4111-8111-111111111111', character: 'nailoong', mediaType: 'video', status: 'queued', aspectRatio: '16:9' }),
    getVideoTask: async () => ({ id: '11111111-1111-4111-8111-111111111111', character: 'nailoong', mediaType: 'video', status: 'succeeded', aspectRatio: '16:9', videoUrl: '/done.mp4' }),
    storage,
    schedule: (callback, delay) => { waits.push({ callback, delay }); return waits.length; },
    cancel: () => {},
    documentRef: { hidden: false, addEventListener() {}, removeEventListener() {} },
  });
  await task.start({ mediaType: 'video', character: 'nailoong', prompt: '撑伞', aspectRatio: '16:9' });
  const saved = storage.value('jiahao-media-task-v1');
  assert.match(saved, /11111111/);
  assert.doesNotMatch(saved, /撑伞/);
  assert.equal(waits[0].delay, 5000);
  await waits[0].callback();
  assert.equal(task.getSnapshot().status, 'succeeded');
  assert.equal(task.getSnapshot().result.videoUrl, '/done.mp4');
  assert.equal(storage.value('jiahao-media-task-v1'), undefined);
});

test('刷新后从版本化本地记录恢复视频任务且不恢复提示词', async () => {
  const storage = memoryStorage({
    'jiahao-media-task-v1': JSON.stringify({ version: 1, id: '22222222-2222-4222-8222-222222222222', character: 'jiahao', mediaType: 'video', aspectRatio: '3:4' }),
  });
  const task = createMediaGenerationTask({
    getVideoTask: async () => ({ id: '22222222-2222-4222-8222-222222222222', character: 'jiahao', mediaType: 'video', status: 'running', aspectRatio: '3:4' }),
    storage,
    schedule: () => 1,
    cancel: () => {},
    documentRef: { hidden: true, addEventListener() {}, removeEventListener() {} },
  });
  await task.restore();
  assert.equal(task.getSnapshot().status, 'running');
  assert.equal(task.getSnapshot().character, 'jiahao');
  assert.equal(task.getSnapshot().input, null);
});

test('每日额度用尽进入可信的独立状态', async () => {
  const error = Object.assign(new Error('今天的视频额度已经用完'), { status: 429, code: 'DAILY_QUOTA_EXHAUSTED' });
  const task = createMediaGenerationTask({ createVideo: async () => { throw error; } });
  await assert.rejects(task.start({ mediaType: 'video', character: 'jiahao', prompt: '回头' }));
  assert.equal(task.getSnapshot().status, 'exhausted');
});
