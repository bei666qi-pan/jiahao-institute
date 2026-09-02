import test from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('抽象生图优先返回 MiniMax 图片且不会调用火山备援', async () => {
  const calls = [];
  const result = await generateAbstractImage({ prompt: '雨夜撑伞等公交', aspectRatio: '1:1' }, config, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse(200, {
      id: 'minimax-image-1',
      data: { image_base64: ['aW1hZ2U='] },
      metadata: { failed_count: '0', success_count: '1' },
      base_resp: { status_code: 0, status_msg: 'success' },
    });
  });

  assert.equal(result.provider, 'minimax');
  assert.equal(result.source, 'MiniMax 图片生成');
  assert.equal(result.imageDataUrl, 'data:image/jpeg;base64,aW1hZ2U=');
  assert.equal(result.fallback.used, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.prompt, /浅黄色软体/);
  assert.equal(calls[0].body.prompt_optimizer, true);
  assert.deepEqual(calls[0].body.subject_reference, [{
    type: 'character', image_file: config.referenceImageUrl,
  }]);
});

test('MiniMax 限流时自动降级火山引擎并标明真实来源', async () => {
  const calls = [];
  const result = await generateAbstractImage({ prompt: '抱臂站在便利店门口', aspectRatio: '3:4' }, config, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (url.includes('minimax')) return jsonResponse(429, { base_resp: { status_code: 1002, status_msg: 'rate limit' } });
    return jsonResponse(200, { id: 'volc-image-1', data: [{ b64_json: 'dm9sYw==' }], usage: { generated_images: 1 } });
  });

  assert.equal(result.provider, 'volcengine');
  assert.equal(result.source, '火山引擎图片生成 · 自动降级');
  assert.equal(result.imageDataUrl, 'data:image/jpeg;base64,dm9sYw==');
  assert.deepEqual(result.fallback, { used: true, from: 'minimax', reason: 'rate_limited' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.size, '1728x2304');
  assert.deepEqual(calls[1].body.image, [config.referenceImageUrl]);
});

test('MiniMax 内容参数错误不会通过备援绕过拒绝', async () => {
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

test('MiniMax 未配置时直接使用火山引擎备援', async () => {
  const result = await generateAbstractImage(
    { prompt: '数脚趾数到怀疑人生', aspectRatio: '16:9' },
    { ...config, minimax: { ...config.minimax, key: '' } },
    async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.size, '2560x1440');
      return jsonResponse(200, { id: 'volc-image-2', data: [{ b64_json: 'YmFja3Vw' }] });
    },
  );
  assert.equal(result.provider, 'volcengine');
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

test('系统提示词固定为抽象奶蛙且禁止官方奶龙与怪物化', () => {
  const prompt = buildAbstractImagePrompt('坐在路边发呆', 'editorial');
  assert.match(prompt, /浅黄色软体/);
  assert.match(prompt, /米白肚皮/);
  assert.match(prompt, /浅绿色凸眼/);
  assert.match(prompt, /禁止.*官方奶龙/);
  assert.match(prompt, /禁止.*尖牙/);
  assert.match(prompt, /不是生物青蛙/);
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
