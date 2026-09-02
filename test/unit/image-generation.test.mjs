import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_PROVIDER_TIMEOUTS,
  buildAbstractImagePrompt,
  generateAbstractImage,
  normalizeImageRequest,
} from '../../server/image-generation.mjs';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const config = {
  referenceImageUrl: 'https://jiahao.test/assets/nailoong/umbrella.webp',
  minimax: { key: 'minimax-test', url: 'https://minimax.test/v1/image_generation', model: 'image-01' },
  volcengine: { key: 'volc-test', url: 'https://ark.test/api/v3/images/generations', model: 'doubao-seedream-test' },
};

const qualityConfig = {
  ...config,
  quality: { key: 'vision-test', url: 'https://ark.test/api/v3/chat/completions', model: 'vision-test' },
};

test('provider timeouts leave enough time for the fallback chain', () => {
  assert.equal(IMAGE_PROVIDER_TIMEOUTS.minimax, 45_000);
  assert.equal(IMAGE_PROVIDER_TIMEOUTS.volcengine, 90_000);
  assert.ok(IMAGE_PROVIDER_TIMEOUTS.minimax < IMAGE_PROVIDER_TIMEOUTS.volcengine);
});

test('抽象生图优先返回火山图片且不会调用 MiniMax 备援', async () => {
  const calls = [];
  const result = await generateAbstractImage({ prompt: '雨夜撑伞等公交', aspectRatio: '1:1' }, config, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse(200, { id: 'volc-image-1', data: [{ b64_json: 'aW1hZ2U=' }] });
  });

  assert.equal(result.provider, 'volcengine');
  assert.equal(result.source, '火山引擎图片生成');
  assert.equal(result.imageDataUrl, 'data:image/jpeg;base64,aW1hZ2U=');
  assert.equal(result.fallback.used, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.prompt, /浅黄色软体/);
  assert.doesNotMatch(calls[0].body.prompt, /蛙|青蛙/);
  assert.match(calls[0].body.prompt, /只能有两只眼睛/);
  assert.match(calls[0].body.prompt, /只有一条短短的水平细线嘴/);
  assert.deepEqual(calls[0].body.image, [config.referenceImageUrl]);
});

test('火山限流时自动降级 MiniMax 并标明真实来源', async () => {
  const calls = [];
  const result = await generateAbstractImage({ prompt: '抱臂站在便利店门口', aspectRatio: '3:4' }, config, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (url.includes('ark.test')) return jsonResponse(429, { error: { code: 'RateLimit', message: 'rate limit' } });
    return jsonResponse(200, { id: 'minimax-image-1', data: { image_base64: ['dm9sYw=='] }, base_resp: { status_code: 0, status_msg: 'success' } });
  });

  assert.equal(result.provider, 'minimax');
  assert.equal(result.source, 'MiniMax 图片生成 · 自动降级');
  assert.equal(result.imageDataUrl, 'data:image/jpeg;base64,dm9sYw==');
  assert.deepEqual(result.fallback, { used: true, from: 'volcengine', reason: 'rate_limited' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.aspect_ratio, '3:4');
  assert.deepEqual(calls[1].body.subject_reference, [{ type: 'character', image_file: config.referenceImageUrl }]);
});

test('火山成图角色走样时经视觉质检自动降级并验收 MiniMax 结果', async () => {
  const calls = [];
  const result = await generateAbstractImage({ prompt: '雨夜发呆', aspectRatio: '1:1' }, qualityConfig, async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.includes('chat/completions')) {
      const image = body.messages[1].content.find((item) => item.type === 'image_url').image_url.url;
      const passes = image.endsWith('Z29vZA==');
      return jsonResponse(200, { choices: [{ message: { content: JSON.stringify({ passes, reason: passes ? '角色一致' : '出现额外五官' }) } }] });
    }
    if (url.includes('minimax')) return jsonResponse(200, {
      id: 'good-minimax', data: { image_base64: ['Z29vZA=='] }, base_resp: { status_code: 0, status_msg: 'success' },
    });
    return jsonResponse(200, { id: 'bad-volc', data: [{ b64_json: 'YmFk' }] });
  });

  assert.equal(result.provider, 'minimax');
  assert.equal(result.fallback.reason, 'identity_mismatch');
  assert.equal(calls.length, 4);
  assert.equal(calls.filter((item) => item.url.includes('chat/completions')).length, 2);
});

test('两家成图都不符合角色时不向玩家返回错误形象', async () => {
  await assert.rejects(
    generateAbstractImage({ prompt: '站着发呆', aspectRatio: '1:1' }, qualityConfig, async (url) => {
      if (url.includes('minimax')) return jsonResponse(200, {
        id: 'bad-minimax', data: { image_base64: ['YmFkMQ=='] }, base_resp: { status_code: 0, status_msg: 'success' },
      });
      if (url.includes('chat/completions')) return jsonResponse(200, {
        choices: [{ message: { content: JSON.stringify({ passes: false, reason: '角色不一致' }) } }],
      });
      return jsonResponse(200, { id: 'bad-volc', data: [{ b64_json: 'YmFkMg==' }] });
    }),
    (error) => error.code === 'IDENTITY_MISMATCH',
  );
});

test('火山内容参数错误不会通过备援绕过拒绝', async () => {
  let calls = 0;
  await assert.rejects(
    generateAbstractImage({ prompt: '违规请求', aspectRatio: '1:1' }, config, async () => {
      calls += 1;
      return jsonResponse(400, { base_resp: { status_code: 2013, status_msg: 'invalid prompt' } });
    }),
    /图片描述未通过校验/,
  );
  assert.equal(calls, 1);
});

test('火山未配置时直接使用 MiniMax 备援', async () => {
  const result = await generateAbstractImage(
    { prompt: '数脚趾数到怀疑人生', aspectRatio: '16:9' },
    { ...config, volcengine: { ...config.volcengine, key: '' } },
    async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.aspect_ratio, '16:9');
      return jsonResponse(200, { id: 'minimax-image-2', data: { image_base64: ['YmFja3Vw'] }, base_resp: { status_code: 0, status_msg: 'success' } });
    },
  );
  assert.equal(result.provider, 'minimax');
  assert.equal(result.fallback.reason, 'not_configured');
});

test('请求只接受三个比例并限制用户描述长度', () => {
  assert.deepEqual(normalizeImageRequest({ prompt: '  雨夜发呆  ', aspectRatio: '2:1' }), {
    prompt: '雨夜发呆',
    aspectRatio: '1:1',
    scene: 'cinematic',
  });
  assert.throws(() => normalizeImageRequest({ prompt: 'a' }), /至少输入两个字/);
  assert.equal(normalizeImageRequest({ prompt: '哈'.repeat(700) }).prompt.length, 500);
});

test('系统提示词用纯视觉约束锁定抽象角色且不触发青蛙物种联想', () => {
  const prompt = buildAbstractImagePrompt('坐在路边发呆', 'editorial');
  assert.match(prompt, /浅黄色软体/);
  assert.match(prompt, /米白肚皮/);
  assert.match(prompt, /浅绿色凸眼/);
  assert.doesNotMatch(prompt, /蛙|青蛙/);
  assert.match(prompt, /只能有两只眼睛/);
  assert.match(prompt, /只有一条短短的水平细线嘴/);
  assert.match(prompt, /禁止.*尖牙/);
  assert.match(prompt, /没有鼻孔/);
  assert.match(prompt, /没有耳朵、角或尾巴/);
});

test('火山参数错误会透明标记为服务配置问题而不是提示词违规', async () => {
  await assert.rejects(
    generateAbstractImage(
      { prompt: '雨夜撑伞', aspectRatio: '1:1' },
      { ...config, minimax: { ...config.minimax, key: '' } },
      async () => jsonResponse(400, {
        error: {
          code: 'InvalidParameter',
          message: 'The parameter `size` specified in the request is not valid',
        },
      }),
    ),
    (error) => {
      assert.equal(error.code, 'PROVIDER_INVALID_PARAMETER');
      assert.match(error.message, /服务参数不兼容/);
      assert.doesNotMatch(error.message, /描述未通过/);
      return true;
    },
  );
});
