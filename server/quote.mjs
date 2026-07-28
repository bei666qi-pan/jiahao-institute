import { randomUUID } from 'node:crypto';
import { calculateEstimatedCost } from './observability.mjs';

const LEVELS = ['豪气初现', '豪气逼人', '豪气冲天', '自在极意豪'];
const STYLES = ['深情', '高冷', '小众', '无意炫耀', '战斗', '朋友圈', '个性签名', '评论区'];
const MAX_BODY_BYTES = 64 * 1024;

const QUOTE_SYSTEM_PROMPT = `你是“嘉豪语录生成器”的中文文案改写官。这是友善的娱乐玩梗工具，不得侮辱、骚扰或煽动伤害任何人，也不要生成仇恨、色情、违法或针对敏感属性的内容。

任务只有两种：
1. hao：把普通话真正改写成嘉豪式表达。需要保留原意，但增加克制、欲言又止、看似无所谓和戏剧化留白；不能原样复述输入，不能只添加标点或语气词。
2. dehao：去掉故作高深、否定式强调和优越感，改成直接、自然、礼貌的普通表达；不能原样复述输入。

豪气等级从弱到强：豪气初现、豪气逼人、豪气冲天、自在极意豪。
风格包括：深情、高冷、小众、无意炫耀、战斗、朋友圈、个性签名、评论区。

只返回一个合法 JSON 对象，不要 Markdown，不要解释。严格结构：
{"output":"改写结果，8到80个中文字符，可以按风格使用换行"}`;

function cleanText(value, fallback = '', max = 300) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('语录内容体积超过限制');
      error.code = 'INVALID_INPUT';
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('请求内容不是合法 JSON');
    error.code = 'INVALID_INPUT';
    throw error;
  }
}

function extractJson(text) {
  const source = cleanText(text, '', 10_000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回有效 JSON');
  return JSON.parse(source.slice(start, end + 1));
}

function contentToText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (typeof part === 'string') return part;
    return typeof part?.text === 'string' ? part.text : '';
  }).join('');
}

function comparable(value) {
  return cleanText(value).replace(/[\s，。！？、,.!?"“”'‘’：:；;（）()【】\[\]-]/g, '');
}

export function normalizeQuotePayload(payload = {}) {
  const mode = payload.mode === 'dehao' ? 'dehao' : 'hao';
  const level = LEVELS.includes(payload.level) ? payload.level : '豪气冲天';
  const style = STYLES.includes(payload.style) ? payload.style : '高冷';
  const input = cleanText(payload.input, '', 300);
  if (input.length < 2) {
    const error = new Error('至少输入两个字');
    error.code = 'INVALID_INPUT';
    throw error;
  }
  return { input, mode, level, style };
}

export function parseQuoteModelResponse(data, payload) {
  const message = data?.choices?.[0]?.message || {};
  const candidate = contentToText(message.content)
    || contentToText(data?.choices?.[0]?.text)
    || contentToText(message.reasoning_content);
  const parsed = extractJson(candidate);
  const output = cleanText(parsed.output, '', 160);
  if (output.length < 2) throw new Error('模型返回的语录为空');
  if (comparable(output) === comparable(payload.input)) throw new Error('模型未完成改写');
  return output;
}

export function getQuoteProvider(env = process.env) {
  return {
    id: 'deepseek',
    base: (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    key: env.DEEPSEEK_API_KEY || '',
    source: '云端文字大模型',
    prices: {
      input: env.DEEPSEEK_INPUT_CNY_PER_MILLION,
      output: env.DEEPSEEK_OUTPUT_CNY_PER_MILLION,
      cachedInput: env.DEEPSEEK_CACHED_INPUT_CNY_PER_MILLION,
    },
  };
}

async function requestAttempt(fetchImpl, provider, payload, attempt) {
  const controller = new AbortController();
  const timeoutMs = attempt === 0 ? 28_000 : 15_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const strictRetry = attempt > 0
    ? '\n上一次输出未通过校验。本次必须生成与原句明显不同、可直接展示的改写结果。'
    : '';
  const body = {
    model: provider.model,
    messages: [
      { role: 'system', content: QUOTE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `任务：${payload.mode}\n豪气等级：${payload.level}\n风格：${payload.style}\n原句：${payload.input}\n请只返回 JSON。${strictRetry}`,
      },
    ],
    temperature: payload.mode === 'hao' ? 0.82 : 0.35,
    max_tokens: 256,
    ...(attempt === 0 ? { response_format: { type: 'json_object' } } : {}),
  };

  try {
    const response = await fetchImpl(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let data = null;
    try { data = responseText ? JSON.parse(responseText) : {}; } catch { /* handled below */ }
    if (!response.ok) {
      const providerMessage = cleanText(data?.error?.message || responseText, '', 180);
      throw new Error(`大模型请求失败（${response.status}）${providerMessage ? `：${providerMessage}` : ''}`);
    }
    if (!data) throw new Error('大模型返回了无法解析的响应');
    return { output: parseQuoteModelResponse(data, payload), usage: data.usage || null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestQuoteModel(rawPayload, options = {}) {
  const payload = normalizeQuotePayload(rawPayload);
  const provider = getQuoteProvider(options.env || process.env);
  const fetchImpl = options.fetchImpl || fetch;
  if (!provider.key) throw new Error('文字大模型尚未配置');

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await requestAttempt(fetchImpl, provider, payload, attempt);
      return {
        data: { output: response.output, source: provider.source },
        usage: response.usage,
        provider,
      };
    } catch (error) {
      lastError = error;
      if (error?.name === 'AbortError' && attempt > 0) break;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw lastError || new Error('云端语录生成暂时不可用');
}

function record(observability, req, details) {
  if (!observability?.recordApiRequest) return;
  try {
    void observability.recordApiRequest(req, details);
  } catch {
    // 观测失败不能影响语录主链路。
  }
}

export async function handleQuoteRequest(req, res, observability) {
  const started = performance.now();
  const requestId = randomUUID();
  let payload = null;
  const provider = getQuoteProvider();
  try {
    payload = await readJson(req);
    const response = await requestQuoteModel(payload);
    const cost = calculateEstimatedCost(response.usage, response.provider.prices);
    sendJson(res, 200, response.data);
    record(observability, req, {
      requestId,
      endpoint: '/api/quote',
      mode: payload.mode === 'dehao' ? 'dehao' : 'hao',
      provider: response.provider.id,
      model: response.provider.model,
      statusCode: 200,
      ok: true,
      latencyMs: performance.now() - started,
      ...cost,
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? '大模型响应超时'
      : cleanText(error?.message, '云端语录生成暂时不可用', 180);
    const statusCode = error?.code === 'INVALID_INPUT' ? 400 : 503;
    sendJson(res, statusCode, { error: message });
    record(observability, req, {
      requestId,
      endpoint: '/api/quote',
      mode: payload?.mode === 'dehao' ? 'dehao' : 'hao',
      provider: provider.id,
      model: provider.model,
      statusCode,
      ok: false,
      latencyMs: performance.now() - started,
      errorCode: error?.name === 'AbortError' ? 'TIMEOUT' : 'QUOTE_GENERATION_FAILED',
      errorMessage: message,
    });
  }
}