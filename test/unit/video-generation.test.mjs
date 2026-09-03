import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VideoGenerationError,
  buildVideoPrompt,
  createArkVideoProvider,
  createVideoGenerationService,
  normalizeVideoRequest,
  shanghaiQuotaWindow,
} from '../../server/video-generation.mjs';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function memoryStore() {
  const tasks = new Map();
  return {
    tasks,
    async quota(visitorId, day) {
      const task = [...tasks.values()].find((item) => item.visitorId === visitorId && item.quotaDate === day);
      return { used: task ? 1 : 0, activeTaskId: task && !['succeeded', 'failed', 'expired'].includes(task.status) ? task.id : null };
    },
    async reserve(task) {
      if ([...tasks.values()].some((item) => item.visitorId === task.visitorId && item.quotaDate === task.quotaDate)) return false;
      tasks.set(task.id, { ...task });
      return true;
    },
    async attachProviderTask(id, providerTaskId) { Object.assign(tasks.get(id), { providerTaskId, status: 'queued' }); },
    async release(id) { tasks.delete(id); },
    async findOwned(id, visitorId) { const task = tasks.get(id); return task?.visitorId === visitorId ? { ...task } : null; },
    async update(id, values) { Object.assign(tasks.get(id), values); return { ...tasks.get(id) }; },
  };
}

const now = new Date('2026-09-03T15:59:59.000Z');
const config = {
  url: 'https://ark.test/api/v3/contents/generations/tasks',
  key: 'volc-key',
  model: 'doubao-seedance-2-0-fast-260128',
  references: { nailoong: 'https://ref.test/nailoong.webp', jiahao: 'https://ref.test/jiahao.webp' },
};

test('上海自然日窗口在午夜准确重置', () => {
  assert.deepEqual(shanghaiQuotaWindow(now), { date: '2026-09-03', resetAt: '2026-09-03T16:00:00.000Z' });
});

test('视频请求只接受两个角色和三个比例', () => {
  assert.deepEqual(normalizeVideoRequest({ character: 'jiahao', prompt: '  蓝色片场回头  ', scene: 'editorial', aspectRatio: '9:16' }), {
    character: 'jiahao', prompt: '蓝色片场回头', scene: 'editorial', aspectRatio: '1:1',
  });
  assert.equal(normalizeVideoRequest({ character: 'bad', prompt: '雨夜撑伞' }).character, 'nailoong');
  assert.throws(() => normalizeVideoRequest({ prompt: 'a' }), /至少输入两个字/);
});

test('奶龙与嘉豪视频提示词不串用身份特征', () => {
  const nailoong = buildVideoPrompt('挥手', 'cinematic', 'nailoong');
  const jiahao = buildVideoPrompt('回头', 'cinematic', 'jiahao');
  assert.match(nailoong, /浅黄色软体/);
  assert.doesNotMatch(nailoong, /嘉豪参考人物/);
  assert.match(jiahao, /嘉豪参考人物/);
  assert.doesNotMatch(jiahao, /浅绿色圆盘眼睛/);
  assert.doesNotMatch(nailoong, /鼻子|牙齿|张嘴|怪物/);
});

test('Fast 视频请求使用参考图、匿名安全标识和固定首版参数', async () => {
  const calls = [];
  const provider = createArkVideoProvider(config, async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    return jsonResponse(200, { id: 'cgt-provider-1' });
  });
  const created = await provider.create({ character: 'jiahao', prompt: '蓝色片场回头', scene: 'cinematic', aspectRatio: '16:9' }, 'visitor-hash');
  assert.equal(created.id, 'cgt-provider-1');
  assert.deepEqual(calls[0], {
    url: config.url,
    method: 'POST',
    body: {
      model: config.model,
      content: [
        { type: 'text', text: buildVideoPrompt('蓝色片场回头', 'cinematic', 'jiahao') },
        { type: 'image_url', image_url: { url: config.references.jiahao }, role: 'reference_image' },
      ],
      safety_identifier: 'visitor-hash', resolution: '720p', ratio: '16:9', duration: 5,
      generate_audio: false, watermark: true,
    },
  });
});

test('供应商任务状态和视频地址被标准化', async () => {
  const provider = createArkVideoProvider(config, async () => jsonResponse(200, {
    id: 'cgt-provider-1', status: 'succeeded', content: { video_url: 'https://video.test/result.mp4' },
  }));
  assert.deepEqual(await provider.get('cgt-provider-1'), {
    status: 'succeeded', videoUrl: 'https://video.test/result.mp4', errorCode: null,
  });
});

test('并发第二次创建被每日唯一额度拒绝并返回已有任务', async () => {
  const store = memoryStore();
  const provider = { create: async () => ({ id: 'cgt-1' }), get: async () => ({ status: 'queued' }) };
  const service = createVideoGenerationService({ store, provider, now: () => now, id: (() => { let i = 0; return () => `task-${++i}`; })(), hashVisitor: () => 'safe-id' });
  const first = await service.create('visitor-1', { character: 'nailoong', prompt: '雨夜撑伞' });
  assert.equal(first.status, 'queued');
  await assert.rejects(service.create('visitor-1', { character: 'jiahao', prompt: '蓝色片场' }),
    (error) => error instanceof VideoGenerationError && error.statusCode === 429 && error.activeTaskId === first.id);
});

test('火山未接受任务时释放额度允许重试', async () => {
  const store = memoryStore();
  let calls = 0;
  const provider = { create: async () => { calls += 1; if (calls === 1) throw new Error('network'); return { id: 'cgt-2' }; } };
  const service = createVideoGenerationService({ store, provider, now: () => now, id: () => `task-${calls + 1}`, hashVisitor: () => 'safe-id' });
  await assert.rejects(service.create('visitor-1', { prompt: '第一次生成' }), /视频服务暂时不可用/);
  const retry = await service.create('visitor-1', { prompt: '第二次生成' });
  assert.equal(retry.status, 'queued');
  assert.equal((await service.quota('visitor-1')).used, 1);
});

test('火山已接受任务后本地写入失败仍保留当日额度', async () => {
  const store = memoryStore();
  store.attachProviderTask = async () => { throw new Error('database unavailable'); };
  const provider = { create: async () => ({ id: 'cgt-accepted' }) };
  const service = createVideoGenerationService({ store, provider, now: () => now, id: () => 'task-accepted', hashVisitor: () => 'safe-id' });
  await assert.rejects(service.create('visitor-1', { prompt: '已经提交给火山' }), /视频任务已提交/);
  assert.equal((await service.quota('visitor-1')).used, 1);
});

test('任务只允许所属访客查询且终态仍消耗额度', async () => {
  const store = memoryStore();
  const provider = { create: async () => ({ id: 'cgt-1' }), get: async () => ({ status: 'failed', errorCode: 'PROVIDER_FAILED' }) };
  const service = createVideoGenerationService({ store, provider, now: () => now, id: () => 'task-1', hashVisitor: () => 'safe-id' });
  await service.create('visitor-1', { character: 'jiahao', prompt: '蓝色片场' });
  await assert.rejects(service.status('task-1', 'visitor-2'), (error) => error.statusCode === 404);
  const task = await service.status('task-1', 'visitor-1');
  assert.equal(task.status, 'failed');
  assert.equal((await service.quota('visitor-1')).remaining, 0);
});
