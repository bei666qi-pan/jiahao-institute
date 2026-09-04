import test from 'node:test';
import assert from 'node:assert/strict';
import { AiConfigService, normalizeAiConfig, openSecret, sealSecret, testAiConnectivity } from '../../server/ai-config.mjs';

test('图片或视频连通测试不会把不存在的地址误判为成功', async () => {
  const config = { slot: 'image', provider: 'volcengine', baseUrl: 'https://api.example/missing', model: 'image-1', apiKey: 'valid-key', options: {} };
  await assert.rejects(testAiConnectivity(config, async () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })), /地址不存在/);
});

test('图片与视频连通测试拒绝所有非成功响应', async () => {
  for (const [slot, provider] of [['image', 'volcengine'], ['video', 'minimax']]) {
    for (const status of [400, 405, 422, 429]) {
      const config = {
        slot, provider, baseUrl: `https://api.example/${slot}`, model: `${slot}-1`, apiKey: 'valid-key',
        options: slot === 'video' ? { queryUrl: 'https://api.example/video/query', fileUrl: 'https://api.example/files' } : {},
      };
      await assert.rejects(testAiConnectivity(config, async () => new Response('{}', { status })), /连通测试失败/);
    }
  }
});

test('图片与视频连通测试发起真实最小生成并校验供应商结果结构', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const payload = url.endsWith('/image') ? { data: [{ url: 'https://cdn.example/probe.jpg' }] } : { task_id: 'probe-task-1', base_resp: { status_code: 0 } };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await testAiConnectivity({ slot: 'image', provider: 'volcengine', baseUrl: 'https://api.example/image', model: 'image-1', apiKey: 'valid-key', options: {} }, fetchImpl);
  await testAiConnectivity({ slot: 'video', provider: 'minimax', baseUrl: 'https://api.example/video', model: 'video-1', apiKey: 'valid-key', options: {} }, fetchImpl);
  assert.deepEqual(calls.map((call) => call.init.method), ['POST', 'POST']);
  assert.deepEqual(calls.map((call) => call.body.model), ['image-1', 'video-1']);
});

test('图片和视频槽位只接受运行时真正支持的供应商', () => {
  assert.equal(normalizeAiConfig('image', { provider: 'volcengine', baseUrl: 'https://api.example/images', model: 'image-1', apiKey: 'valid-key' }).provider, 'volcengine');
  assert.equal(normalizeAiConfig('video', { provider: 'minimax', baseUrl: 'https://api.example/video', queryUrl: 'https://api.example/video/query', fileUrl: 'https://api.example/files', model: 'video-1', apiKey: 'valid-key' }).provider, 'minimax');
  assert.throws(() => normalizeAiConfig('image', { provider: 'minimax', baseUrl: 'https://api.example/images', model: 'image-1', apiKey: 'valid-key' }), /图片生成仅支持火山引擎/);
  assert.throws(() => normalizeAiConfig('video', { provider: 'volcengine', baseUrl: 'https://api.example/video', queryUrl: 'https://api.example/video/query', fileUrl: 'https://api.example/files', model: 'video-1', apiKey: 'valid-key' }), /视频生成仅支持 MiniMax/);
});

test('AI 密钥加密保存且不在公开配置中回显', () => {
  const sealed = sealSecret('sk-private-value', 'admin-encryption-secret');
  assert.equal(JSON.stringify(sealed).includes('sk-private-value'), false);
  assert.equal(openSecret(sealed, 'admin-encryption-secret'), 'sk-private-value');
});

test('只有真实连通测试成功才能激活新 AI 配置', async () => {
  const writes = [];
  const db = { query: async (sql, params = []) => {
    if (/insert into jh_ai_configurations/.test(sql)) writes.push(params);
    return { rowCount: 0, rows: [] };
  } };
  const service = new AiConfigService({ ADMIN_PASSWORD: 'admin-encryption-secret' }, db, {
    testConnection: async (config) => {
      if (config.apiKey === 'bad-key') throw new Error('鉴权失败');
      return { latencyMs: 12 };
    },
  });
  await assert.rejects(service.test('text', { provider: 'minimax', baseUrl: 'https://api.example/v1', model: 'm1', apiKey: 'bad-key' }), /鉴权失败/);
  assert.equal(writes.length, 0);
  const checked = await service.test('text', { provider: 'minimax', baseUrl: 'https://api.example/v1', model: 'm1', apiKey: 'good-key' });
  await service.activate(checked.testToken);
  assert.equal(writes.length, 1);
  assert.equal(JSON.stringify(writes[0]).includes('good-key'), false);
});

test('测试凭据一次性且过期或重放都不能更换配置', async () => {
  const db = { query: async () => ({ rowCount: 0, rows: [] }) };
  let now = 1_000;
  const service = new AiConfigService({ ADMIN_PASSWORD: 'admin-encryption-secret' }, db, { now: () => now, testConnection: async () => ({ latencyMs: 1 }) });
  const first = await service.test('image', { provider: 'volcengine', baseUrl: 'https://api.example/images', model: 'image-1', apiKey: 'valid-key' });
  await service.activate(first.testToken);
  await assert.rejects(service.activate(first.testToken), /无效或已使用/);
  const second = await service.test('video', { provider: 'minimax', baseUrl: 'https://api.example/video', queryUrl: 'https://api.example/video/query', fileUrl: 'https://api.example/files', model: 'video-1', apiKey: 'valid-key' });
  now += 301_000;
  await assert.rejects(service.activate(second.testToken), /已过期/);
});

test('视觉槽位默认沿用已配置的 MiniMax 多模态能力', async () => {
  const service = new AiConfigService({
    MINIMAX_TEXT_API_KEY: 'minimax-key',
    MINIMAX_TEXT_BASE_URL: 'https://api.minimax.test/v1',
    MINIMAX_TEXT_MODEL: 'MiniMax-M3',
    ARK_API_KEY: 'ark-key',
    ARK_MODEL: 'ark-model',
  });
  const config = await service.runtime('vision');
  assert.equal(config.provider, 'minimax');
  assert.equal(config.model, 'MiniMax-M3');
});
