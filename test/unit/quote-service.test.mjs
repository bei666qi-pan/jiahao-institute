import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeQuotePayload,
  parseQuoteModelResponse,
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

test('parseQuoteModelResponse accepts array content and rejects unchanged output', () => {
  const payload = normalizeQuotePayload({ input: '今天有点累。', mode: 'hao' });
  const output = parseQuoteModelResponse({
    choices: [{ message: { content: [{ type: 'text', text: '{"output":"身体会累，但我不会停。"}' }] } }],
  }, payload);
  assert.equal(output, '身体会累，但我不会停。');

  assert.throws(() => parseQuoteModelResponse({
    choices: [{ message: { content: '{"output":"今天有点累。"}' } }],
  }, payload), /未完成改写/);
});

test('requestQuoteModel retries without response_format when provider rejects it', async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    if (requests.length === 1) {
      return jsonResponse({ error: { message: 'response_format is not supported' } }, 400);
    }
    return jsonResponse({
      choices: [{ message: { content: '{"output":"不是累，只是今天的风有点重。"}' } }],
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
  assert.equal(result.data.output, '不是累，只是今天的风有点重。');
  assert.equal(result.data.source, '云端文字大模型');
});

test('requestQuoteModel retries when the first response only echoes the input', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse({
      choices: [{ message: { content: calls === 1
        ? '{"output":"今天有点累。"}'
        : '{"output":"身体说累，故事还没准备收场。"}' } }],
    });
  };

  const result = await requestQuoteModel({ input: '今天有点累。', mode: 'hao' }, { env, fetchImpl });
  assert.equal(calls, 2);
  assert.equal(result.data.output, '身体说累，故事还没准备收场。');
});

test('requestQuoteModel fails clearly when the API key is missing', async () => {
  await assert.rejects(
    requestQuoteModel({ input: '今天有点累。', mode: 'hao' }, { env: {}, fetchImpl: async () => { throw new Error('should not call'); } }),
    /文字大模型尚未配置/,
  );
});