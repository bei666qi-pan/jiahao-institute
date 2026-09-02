import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertQuoteQuality,
  getQuoteProvider,
  makeCalibratedHaoQuote,
  mergeQuoteUsage,
  normalizeQuotePayload,
  parseQuoteModelResponse,
  QUOTE_SERVICE_VERSION,
  requestQuoteModel,
} from '../../server/quote.mjs';

const env = {
  DEEPSEEK_BASE_URL: 'https://model.example.test/v1',
  DEEPSEEK_API_KEY: 'test-secret',
  DEEPSEEK_MODEL: 'test-model',
};

test('MiniMax credentials take priority for text generation', () => {
  const provider = getQuoteProvider({
    MINIMAX_API_KEY: 'minimax-secret',
    MINIMAX_TEXT_BASE_URL: 'https://api.minimax.cn/v1/',
    MINIMAX_TEXT_MODEL: 'MiniMax-M3',
    DEEPSEEK_API_KEY: 'deepseek-secret',
  });
  assert.deepEqual({ id: provider.id, base: provider.base, model: provider.model, key: provider.key }, {
    id: 'minimax',
    base: 'https://api.minimax.cn/v1',
    model: 'MiniMax-M3',
    key: 'minimax-secret',
  });
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('quote service exposes the current deployment version', () => {
  assert.equal(QUOTE_SERVICE_VERSION, 5);
});

test('normalizeQuotePayload validates and normalizes quote options', () => {
  assert.deepEqual(normalizeQuotePayload({
    input: '  今天有点累。  ',
    mode: 'hao',
    level: '豪气逼人',
    style: '深情',
  }), {
    input: '今天有点累。',
    mode: 'hao',
    level: '豪气逼人',
    style: '深情',
  });

  assert.throws(() => normalizeQuotePayload({ input: 'a' }), /至少输入两个字/);
});

test('parseQuoteModelResponse accepts JSON, array content and plain text', () => {
  const payload = normalizeQuotePayload({ input: '我今天真的感觉有点累。', mode: 'hao' });
  const jsonOutput = parseQuoteModelResponse({
    choices: [{ message: { content: [{ type: 'text', text: '{"output":"身体会累，但我不会停。"}' }] } }],
  }, payload);
  assert.equal(jsonOutput, '身体会累，但我不会停。');

  const plainOutput = parseQuoteModelResponse({
    choices: [{ message: { content: '改写结果：累只是表象，路还没有走完。' } }],
  }, payload);
  assert.equal(plainOutput, '累只是表象，路还没有走完。');

  const markdownOutput = parseQuoteModelResponse({
    choices: [{ message: { content: '```text\n“身体会累，故事还没准备收场。”\n```' } }],
  }, payload);
  assert.equal(markdownOutput, '身体会累，故事还没准备收场。');
});

test('short dramatic fragments must be visibly expanded and retain their core image', () => {
  const payload = normalizeQuotePayload({ input: '凡人之血', mode: 'hao', level: '豪气冲天', style: '高冷' });
  assert.throws(() => assertQuoteQuality('凡人之血。', payload), /未完成改写|幅度不足/);
  assert.throws(() => assertQuoteQuality('众生已经低头，而我依旧独自向前。', payload), /核心意象/);
  assert.doesNotThrow(() => assertQuoteQuality('凡人之血，也配让我停下脚步？', payload));

  const calibrated = makeCalibratedHaoQuote(payload);
  assert.equal(calibrated, '凡人之血，也配让我停下脚步？');
});

test('calibrated short-input fallback is valid for every level and style', () => {
  const inputs = ['累了', '凡人之血', '今天有点累了啊'];
  const levels = ['豪气初现', '豪气逼人', '豪气冲天', '自在极意豪'];
  const styles = ['深情', '高冷', '小众', '无意炫耀', '战斗', '朋友圈', '个性签名', '评论区'];

  for (const input of inputs) {
    for (const level of levels) {
      for (const style of styles) {
        const payload = normalizeQuotePayload({ input, mode: 'hao', level, style });
        const output = makeCalibratedHaoQuote(payload);
        assert.doesNotThrow(() => assertQuoteQuality(output, payload), `${input} / ${level} / ${style}`);
      }
    }
  }
});

test('parseQuoteModelResponse rejects unchanged output before display truncation', () => {
  const longInput = '今天有点累但是事情还没有结束'.repeat(16).slice(0, 280);
  const payload = normalizeQuotePayload({ input: longInput, mode: 'hao' });
  assert.throws(() => parseQuoteModelResponse({
    choices: [{ message: { content: JSON.stringify({ output: longInput }) } }],
  }, payload), /未完成改写/);

  assert.throws(() => parseQuoteModelResponse({
    choices: [{ message: { content: '{"output":"今天有点累。"}' } }],
  }, normalizeQuotePayload({ input: '今天有点累。', mode: 'hao' })), /未完成改写/);
});

test('parseQuoteModelResponse never exposes reasoning-only content', () => {
  const payload = normalizeQuotePayload({ input: '今天有点累。', mode: 'hao' });
  assert.throws(() => parseQuoteModelResponse({
    choices: [{
      finish_reason: 'length',
      message: { content: '', reasoning_content: '内部推理过程不得展示' },
    }],
  }, payload), (error) => {
    assert.match(error.message, /未返回最终内容/);
    assert.match(error.message, /finish_reason=length/);
    assert.match(error.message, /reasoning=present/);
    assert.doesNotMatch(error.message, /内部推理过程/);
    return true;
  });
});

test('requestQuoteModel retries with a plain-text protocol when response_format is rejected', async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      return jsonResponse({ error: { message: 'response_format is not supported' } }, 400);
    }
    return jsonResponse({
      choices: [{ message: { content: '不是累，只是今天的风有点重。' } }],
      usage: { prompt_tokens: 20, completion_tokens: 12 },
    });
  };

  const result = await requestQuoteModel({
    input: '今天有点累。',
    mode: 'hao',
    level: '豪气冲天',
    style: '高冷',
  }, { env, fetchImpl });

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].response_format, { type: 'json_object' });
  assert.equal('response_format' in requests[1], false);
  assert.deepEqual(requests[0].thinking, { type: 'disabled' });
  assert.deepEqual(requests[1].thinking, { type: 'disabled' });
  assert.equal(requests[0].stream, false);
  assert.equal(requests[1].stream, false);
  assert.equal(requests[0].max_tokens, 512);
  assert.equal(requests[1].max_tokens, 512);
  assert.match(requests[1].messages[0].content, /不要 JSON/);
  assert.equal(result.data.output, '不是累，只是今天的风有点重。');
  assert.equal(result.data.source, '云端文字大模型');
  assert.equal(result.data.serviceVersion, QUOTE_SERVICE_VERSION);
});

test('short inputs get an explicit expansion instruction and retry weak outputs', async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return jsonResponse({
      choices: [{ message: { content: requests.length === 1
        ? '{"output":"凡人之血。"}'
        : '凡人之血，也配让我停下脚步？' } }],
      usage: { prompt_tokens: 10, completion_tokens: 6 },
    });
  };

  const result = await requestQuoteModel({
    input: '凡人之血',
    mode: 'hao',
    level: '豪气冲天',
    style: '高冷',
  }, { env, fetchImpl });

  assert.equal(requests.length, 2);
  assert.match(requests[0].messages[1].content, /短句强制要求/);
  assert.match(requests[0].messages[1].content, /至少 12 个有效字符/);
  assert.equal(result.data.output, '凡人之血，也配让我停下脚步？');
  assert.equal(result.data.source, '云端文字大模型');
});

test('short inputs receive a calibrated guaranteed rewrite after two weak model outputs', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({
      choices: [{ message: { content: calls === 1 ? '{"output":"凡人之血。"}' : '不过如此。' } }],
      usage: { prompt_tokens: 8, completion_tokens: 4 },
    });
  };

  const result = await requestQuoteModel({
    input: '凡人之血',
    mode: 'hao',
    level: '豪气冲天',
    style: '高冷',
  }, { env, fetchImpl });

  assert.equal(calls, 2);
  assert.equal(result.data.output, '凡人之血，也配让我停下脚步？');
  assert.equal(result.data.source, '云端文字大模型 · 豪化校准');
  assert.equal(result.data.calibrated, true);
  assert.deepEqual(result.usage, {
    prompt_tokens: 16,
    completion_tokens: 8,
    total_tokens: 24,
  });
});

test('two-character input still returns a calibrated rewrite for the formerly failing combination', async () => {
  const fetchImpl = async () => jsonResponse({
    choices: [{ message: { content: '{"output":"累了。"}' } }],
  });

  const result = await requestQuoteModel({
    input: '累了',
    mode: 'hao',
    level: '豪气冲天',
    style: '高冷',
  }, { env, fetchImpl });

  assert.equal(result.data.calibrated, true);
  assert.equal(result.data.serviceVersion, QUOTE_SERVICE_VERSION);
  assert.doesNotThrow(() => assertQuoteQuality(result.data.output, normalizeQuotePayload({
    input: '累了', mode: 'hao', level: '豪气冲天', style: '高冷',
  })));
});

test('requestQuoteModel accepts a provider plain-text response without a needless retry', async () => {
  let calls = 0;
  let requestBody;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    requestBody = JSON.parse(options.body);
    return jsonResponse({
      choices: [{ message: { content: '累只是身体的意见，我还没有同意。' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    });
  };

  const result = await requestQuoteModel({ input: '今天有点累。', mode: 'hao' }, { env, fetchImpl });
  assert.equal(calls, 1);
  assert.deepEqual(requestBody.thinking, { type: 'disabled' });
  assert.equal(result.data.output, '累只是身体的意见，我还没有同意。');
});

test('requestQuoteModel retries unchanged output and accumulates billable usage', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({
      choices: [{ message: { content: calls === 1
        ? '{"output":"今天有点累。"}'
        : '身体说累，故事还没准备收场。' } }],
      usage: calls === 1
        ? { prompt_tokens: 18, completion_tokens: 6, prompt_tokens_details: { cached_tokens: 2 } }
        : { prompt_tokens: 12, completion_tokens: 8, prompt_tokens_details: { cached_tokens: 1 } },
    });
  };

  const result = await requestQuoteModel({ input: '今天有点累。', mode: 'hao' }, { env, fetchImpl });
  assert.equal(calls, 2);
  assert.equal(result.data.output, '身体说累，故事还没准备收场。');
  assert.deepEqual(result.usage, {
    prompt_tokens: 30,
    completion_tokens: 14,
    total_tokens: 44,
    prompt_tokens_details: { cached_tokens: 3 },
  });
});

test('mergeQuoteUsage supports input/output token aliases', () => {
  assert.deepEqual(mergeQuoteUsage(
    { input_tokens: 10, output_tokens: 4, input_tokens_details: { cached_tokens: 1 } },
    { prompt_tokens: 8, completion_tokens: 5, prompt_cache_hit_tokens: 2 },
  ), {
    prompt_tokens: 18,
    completion_tokens: 9,
    total_tokens: 27,
    prompt_tokens_details: { cached_tokens: 3 },
  });
});

test('requestQuoteModel fails clearly when the API key is missing', async () => {
  await assert.rejects(
    requestQuoteModel({ input: '今天有点累。', mode: 'hao' }, { env: {}, fetchImpl: async () => { throw new Error('should not call'); } }),
    /文字大模型尚未配置/,
  );
});
