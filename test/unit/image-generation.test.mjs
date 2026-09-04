import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_PROVIDER_TIMEOUTS,
  buildAbstractImagePrompt,
  generateAbstractImage,
  normalizeImageRequest,
} from '../../server/image-generation.mjs';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const config = {
  references: {
    nailoong: 'https://jiahao.test/assets/nailoong/umbrella.webp',
    jiahao: ['https://jiahao.test/assets/jiahao/hao-universe-hero.webp', 'https://jiahao.test/assets/jiahao/hao-assay-editorial.webp'],
  },
  volcengine: { key: 'volc-test', url: 'https://ark.test/api/v3/images/generations', model: 'doubao-seedream-5.0-lite' },
};

test('图片服务只等待火山链路而不为 MiniMax 备援预留时间', () => {
  assert.deepEqual(IMAGE_PROVIDER_TIMEOUTS, { volcengine: 90_000 });
});

test('旧请求默认生成奶龙图片并返回公开媒体身份', async () => {
  const calls = [];
  const result = await generateAbstractImage({ prompt: '雨夜撑伞等公交', aspectRatio: '1:1' }, config, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse(200, { id: 'volc-image-1', data: [{ b64_json: 'aW1hZ2U=' }] });
  });
  assert.equal(result.character, 'nailoong');
  assert.equal(result.mediaType, 'image');
  assert.equal(result.provider, 'volcengine');
  assert.equal(result.source, '火山引擎图片生成');
  assert.equal(result.imageDataUrl, 'data:image/jpeg;base64,aW1hZ2U=');
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.prompt, /浅黄色软体/);
  assert.doesNotMatch(calls[0].body.prompt, /嘉豪人物/);
  assert.deepEqual(calls[0].body.image, [config.references.nailoong]);
  assert.equal(calls[0].body.response_format, 'url');
  assert.equal(calls[0].body.output_format, 'jpeg');
});

test('嘉豪请求使用独立提示词和嘉豪参考图', async () => {
  const calls = [];
  const result = await generateAbstractImage({ character: 'jiahao', prompt: '站在蓝色片场里回头', aspectRatio: '3:4' }, config, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse(200, { id: 'jiahao-image-1', data: [{ url: 'https://img.test/jiahao.jpg' }] });
  });
  assert.equal(result.character, 'jiahao');
  assert.equal(result.mediaType, 'image');
  assert.equal(result.imageUrl, 'https://img.test/jiahao.jpg');
  assert.match(calls[0].body.prompt, /嘉豪人物/);
  assert.doesNotMatch(calls[0].body.prompt, /浅绿色凸眼/);
  assert.deepEqual(calls[0].body.image, config.references.jiahao);
  assert.equal(calls[0].body.size, '1728x2304');
});

test('火山限流不会调用 MiniMax 备援', async () => {
  let calls = 0;
  await assert.rejects(generateAbstractImage({ prompt: '抱臂站在便利店门口' }, { ...config, minimax: { key: 'must-not-use' } }, async () => {
    calls += 1;
    return jsonResponse(429, { error: { code: 'RateLimit', message: 'rate limit' } });
  }), (error) => error.code === 'RATE_LIMITED' && error.provider === 'volcengine');
  assert.equal(calls, 1);
});

test('仅对供应商输出图片误拦截自动重试一次', async () => {
  let calls = 0;
  const result = await generateAbstractImage({ prompt: '在草地上挥手' }, config, async () => {
    calls += 1;
    if (calls === 1) return jsonResponse(400, { error: { code: 'OutputImageSensitiveContentDetected', message: 'output image risk' } });
    return jsonResponse(200, { id: 'retry-ok', data: [{ url: 'https://img.test/retry.jpg' }] });
  });
  assert.equal(calls, 2);
  assert.equal(result.imageUrl, 'https://img.test/retry.jpg');
});

test('请求校验角色、比例并限制用户描述长度', () => {
  assert.deepEqual(normalizeImageRequest({ character: 'jiahao', prompt: '  雨夜发呆  ', aspectRatio: '2:1' }), {
    character: 'jiahao', prompt: '雨夜发呆', aspectRatio: '1:1', scene: 'cinematic',
  });
  assert.equal(normalizeImageRequest({ character: 'unknown', prompt: '雨夜发呆' }).character, 'nailoong');
  assert.throws(() => normalizeImageRequest({ prompt: 'a' }), /至少输入两个字/);
  assert.equal(normalizeImageRequest({ prompt: '哈'.repeat(700) }).prompt.length, 500);
});

test('两个角色提示词互不串用身份约束', () => {
  const nailoong = buildAbstractImagePrompt('坐在路边发呆', 'editorial', 'nailoong');
  const jiahao = buildAbstractImagePrompt('坐在路边发呆', 'editorial', 'jiahao');
  assert.match(nailoong, /浅黄色软体/);
  assert.doesNotMatch(nailoong, /嘉豪人物/);
  assert.match(jiahao, /嘉豪人物/);
  assert.doesNotMatch(jiahao, /浅绿色凸眼/);
  assert.doesNotMatch(nailoong, /鼻孔|尖牙|大嘴|恐怖|怪物/);
});

test('火山未配置时明确失败而不是调用其他供应商', async () => {
  await assert.rejects(generateAbstractImage({ prompt: '数脚趾数到怀疑人生' }, { ...config, volcengine: { ...config.volcengine, key: '' } }),
    (error) => error.code === 'NOT_CONFIGURED' && /火山引擎/.test(error.message));
});
