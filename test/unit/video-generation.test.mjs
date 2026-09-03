import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VideoGenerationError,
  buildVideoPrompt,
  createMinimaxVideoProvider,
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

test('MiniMax Hailuo 2.3 使用按所选比例生成的角色首帧创建视频', async () => {
  const calls = [];
  const frameRequests = [];
  const provider = createMinimaxVideoProvider({
    key: 'minimax-key',
    url: 'https://api.minimaxi.test/v1/video_generation',
    queryUrl: 'https://api.minimaxi.test/v1/query/video_generation',
    fileUrl: 'https://api.minimaxi.test/v1/files/retrieve',
    model: 'MiniMax-Hailuo-2.3',
    createFirstFrame: async (request) => {
      frameRequests.push(request);
      return 'https://frames.test/jiahao-16-9.jpg';
    },
  }, async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) });
    return jsonResponse(200, { task_id: 'minimax-task-1', base_resp: { status_code: 0, status_msg: 'success' } });
  });

  const request = { character: 'jiahao', prompt: '蓝色片场回头', scene: 'cinematic', aspectRatio: '16:9' };
  assert.deepEqual(await provider.create(request), { id: 'minimax-task-1' });
  assert.deepEqual(frameRequests, [request]);
  assert.deepEqual(calls[0], {
    url: 'https://api.minimaxi.test/v1/video_generation',
    method: 'POST',
    body: {
      model: 'MiniMax-Hailuo-2.3',
      prompt: buildVideoPrompt('蓝色片场回头', 'cinematic', 'jiahao'),
      first_frame_image: 'https://frames.test/jiahao-16-9.jpg',
      duration: 6,
      resolution: '768P',
      prompt_optimizer: true,
      aigc_watermark: true,
    },
  });
});

test('MiniMax 成功任务会查询文件地址并标准化状态', async () => {
  const calls = [];
  const provider = createMinimaxVideoProvider({
    key: 'minimax-key',
    queryUrl: 'https://api.minimaxi.test/v1/query/video_generation',
    fileUrl: 'https://api.minimaxi.test/v1/files/retrieve',
  }, async (url, init) => {
    calls.push({ url, method: init.method });
    if (url.includes('/query/')) return jsonResponse(200, {
      task_id: 'minimax-task-1', status: 'Success', file_id: 'file-9',
      base_resp: { status_code: 0, status_msg: 'success' },
    });
    return jsonResponse(200, {
      file: { file_id: 'file-9', filename: 'output.mp4', purpose: 'video_generation', download_url: 'https://video.test/result.mp4' },
      base_resp: { status_code: 0, status_msg: 'success' },
    });
  });

  assert.deepEqual(await provider.get('minimax-task-1'), {
    status: 'succeeded', videoUrl: 'https://video.test/result.mp4', errorCode: null,
  });
  assert.deepEqual(calls, [
    { url: 'https://api.minimaxi.test/v1/query/video_generation?task_id=minimax-task-1', method: 'GET' },
    { url: 'https://api.minimaxi.test/v1/files/retrieve?file_id=file-9', method: 'GET' },
  ]);
});

test('MiniMax 额度或频率耗尽时只返回统一的可信提示', async () => {
  for (const statusCode of [1002, 1008, 2056]) {
    const provider = createMinimaxVideoProvider({
      key: 'minimax-key', url: 'https://api.minimaxi.test/v1/video_generation',
      createFirstFrame: async () => 'https://frames.test/nailoong.jpg',
    }, async () => jsonResponse(200, { base_resp: { status_code: statusCode, status_msg: 'provider detail must stay private' } }));
    await assert.rejects(
      provider.create({ character: 'nailoong', prompt: '缓慢挥手', scene: 'cinematic', aspectRatio: '1:1' }),
      (error) => error.code === 'PROVIDER_CAPACITY_EXHAUSTED' && error.message === '今日使用人数过多，暂不支持生成',
    );
  }
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

test('供应商未接受任务时释放额度允许重试', async () => {
  const store = memoryStore();
  let calls = 0;
  const provider = { create: async () => { calls += 1; if (calls === 1) throw new Error('network'); return { id: 'cgt-2' }; } };
  const service = createVideoGenerationService({ store, provider, now: () => now, id: () => `task-${calls + 1}`, hashVisitor: () => 'safe-id' });
  await assert.rejects(service.create('visitor-1', { prompt: '第一次生成' }), /视频服务暂时不可用/);
  const retry = await service.create('visitor-1', { prompt: '第二次生成' });
  assert.equal(retry.status, 'queued');
  assert.equal((await service.quota('visitor-1')).used, 1);
});

test('供应商已接受任务后本地写入失败仍保留当日额度', async () => {
  const store = memoryStore();
  store.attachProviderTask = async () => { throw new Error('database unavailable'); };
  const provider = { create: async () => ({ id: 'cgt-accepted' }) };
  const service = createVideoGenerationService({ store, provider, now: () => now, id: () => 'task-accepted', hashVisitor: () => 'safe-id' });
  await assert.rejects(service.create('visitor-1', { prompt: '已经提交给火山' }), /视频任务已提交/);
  assert.equal((await service.quota('visitor-1')).used, 1);
});

test('视频供应商被停用时不展示虚假额度也不调用供应商', async () => {
  let providerCalls = 0;
  const service = createVideoGenerationService({
    store: memoryStore(),
    provider: { create: async () => { providerCalls += 1; } },
    enabled: false,
    unavailableMessage: '今日使用人数过多，暂不支持生成',
  });
  await assert.rejects(service.quota('visitor-1'), (error) => error.code === 'VIDEO_PLAN_UNAVAILABLE' && error.statusCode === 503);
  await assert.rejects(service.create('visitor-1', { prompt: '缓慢挥手' }), (error) => error.code === 'VIDEO_PLAN_UNAVAILABLE');
  assert.equal(providerCalls, 0);
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

test('供应商状态已取回时数据库回写失败不阻断用户看到真实成片', async () => {
  const store = memoryStore();
  const provider = {
    create: async () => ({ id: 'minimax-accepted' }),
    get: async () => ({ status: 'succeeded', videoUrl: 'https://video.test/real.mp4', errorCode: null }),
  };
  const service = createVideoGenerationService({ store, provider, now: () => now, id: () => 'task-sync-degraded' });
  await service.create('visitor-1', { character: 'nailoong', prompt: '缓慢挥手' });
  store.update = async () => { throw new Error('database write unavailable'); };

  const task = await service.status('task-sync-degraded', 'visitor-1');
  assert.equal(task.status, 'succeeded');
  assert.equal(task.videoUrl, 'https://video.test/real.mp4');
  assert.equal(task.quota.remaining, 0);
  assert.equal(task.quota.activeTaskId, null);
});
