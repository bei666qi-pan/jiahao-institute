import test from 'node:test';
import assert from 'node:assert/strict';
import {
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
  const payload = normalizeQuotePayload({ input: '今天有点累。', mode: 'hao' });
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

test('parseQuoteModelResponse does not expose reasoning-only content', () => {
  const payload = normalizeQuotePayload({ input: '今天有点累。', mode: 'hao' });
  assert.throws(() => parseQuoteModelResponse({
    choices: [{ message: { content: '', reasoning_content: '内部推理过程' } }],
  }, payload), /返回内容为空/);
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
  assert.match(requests[1].messages[0].content, /不要 JSON/);
  assert.equal(result.data.output, '不是累，只是今天的风有点重。');
  assert.equal(result.data.source, '云端文字大模型');
  assert.equal(result.data.serviceVersion, QUOTE_SERVICE_VERSION);
});

test('requestQuoteModel accepts a provider plain-text response without a needless retry', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({
      choices: [{ message: { content: '累只是身体的意见，我还没有同意。' } }],
      usage: { prompt_tokens: 12, completion_tokens: 8 },
    });
  };

  const result = await requestQuoteModel({ input: '今天有点累。', mode: 'hao' }, { env, fetchImpl });
  assert.equal(calls, 1);
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
