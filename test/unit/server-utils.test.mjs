import test from 'node:test';
import assert from 'node:assert/strict';

// === extractJson tests ===
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回有效结构');
  return JSON.parse(text.slice(start, end + 1));
}

test('extractJson parses valid JSON with surrounding text', () => {
  const result = extractJson('some text before {"score": 80, "type": "潜伏嘉豪"} and after');
  assert.equal(result.score, 80);
  assert.equal(result.type, '潜伏嘉豪');
});

test('extractJson parses nested JSON', () => {
  const text = '```json\n{"dimensions": {"mystery": 50, "flex": 60}, "type": "美式嘉豪"}\n```';
  const result = extractJson(text);
  assert.equal(result.type, '美式嘉豪');
  assert.equal(result.dimensions.mystery, 50);
  assert.equal(result.dimensions.flex, 60);
});

test('extractJson extracts object from mixed content including arrays', () => {
  const text = 'prefix [1,2,3] {"a": 1, "b": 2} suffix';
  const result = extractJson(text);
  assert.deepEqual(result, { a: 1, b: 2 });
});

test('extractJson throws on missing object', () => {
  assert.throws(() => extractJson('no json here'), /模型未返回有效结构/);
});

test('extractJson throws on unbalanced braces', () => {
  assert.throws(() => extractJson('{"incomplete'), /模型未返回有效结构/);
});

test('extractJson handles deeply nested JSON with special characters', () => {
  const text = '{"verdict": "他说: \\"你好\\"", "comment": "50到100字的评语"}';
  const result = extractJson(text);
  assert.equal(result.verdict, '他说: "你好"');
  assert.ok(result.comment.includes('评语'));
});

test('extractJson handles empty object', () => {
  const result = extractJson('{}');
  assert.deepEqual(result, {});
});

test('extractJson handles JSON with unicode escape sequences', () => {
  const text = '{"label":"\\u8c6a\\u6c14"}';
  const result = extractJson(text);
  assert.equal(result.label, '豪气');
});

test('extractJson handles JSON with multiple nested objects', () => {
  const text = 'prefix {"outer":{"inner":{"value":42}}} suffix';
  const result = extractJson(text);
  assert.equal(result.outer.inner.value, 42);
});

test('extractJson throws for array-only content (extracts bad JSON slice)', () => {
  // The function looks for { and }, so for [{...}, {...}] it extracts
  // {...}, {...} which is invalid JSON and throws SyntaxError
  assert.throws(() => extractJson('[{"a": 1}, {"b": 2}]'));
});

// === cleanText tests ===
function cleanText(value, fallback, max = 240) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

test('cleanText returns trimmed string', () => {
  assert.equal(cleanText('  hello  ', 'default'), 'hello');
});

test('cleanText returns fallback for empty string', () => {
  assert.equal(cleanText('', 'fallback'), 'fallback');
  assert.equal(cleanText('   ', 'fallback'), 'fallback');
});

test('cleanText returns fallback for non-string', () => {
  assert.equal(cleanText(null, 'fallback'), 'fallback');
  assert.equal(cleanText(undefined, 'fallback'), 'fallback');
  assert.equal(cleanText(123, 'fallback'), 'fallback');
});

test('cleanText truncates to max length', () => {
  const long = 'a'.repeat(300);
  assert.equal(cleanText(long, 'fallback').length, 240);
  assert.equal(cleanText(long, 'fallback', 10).length, 10);
});

test('cleanText handles numbers as strings', () => {
  assert.equal(cleanText('42', 'fallback'), '42');
});

// === clampServer tests ===
function clampServer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 50;
}

test('clampServer returns valid range', () => {
  assert.equal(clampServer(50), 50);
  assert.equal(clampServer(0), 0);
  assert.equal(clampServer(100), 100);
  assert.equal(clampServer(-10), 0);
  assert.equal(clampServer(150), 100);
  assert.equal(clampServer(50.7), 51);
});

test('clampServer returns 50 for NaN', () => {
  assert.equal(clampServer(NaN), 50);
});

test('clampServer returns 50 for Infinity', () => {
  assert.equal(clampServer(Infinity), 50);
});

test('clampServer converts null to 0 (Number(null) is 0, which is finite)', () => {
  assert.equal(clampServer(null), 0);
});

test('clampServer returns 50 for undefined (Number(undefined) is NaN)', () => {
  assert.equal(clampServer(undefined), 50);
});

test('clampServer converts empty string to 0 (Number("") is 0, which is finite)', () => {
  assert.equal(clampServer(''), 0);
});

test('clampServer returns 50 for non-numeric string', () => {
  assert.equal(clampServer('not a number'), 50);
});

// === normalizeResult tests ===
const TYPES = ['自在极意豪', '美式嘉豪', '深情破碎豪', '计算机嘉豪', '股票嘉豪', '不懂装懂豪', '小众优越豪', '潜伏嘉豪', '反向嘉豪', '无意炫耀豪'];
const DIMENSIONS = ['mystery', 'flex', 'niche', 'deep', 'show', 'language'];

function normalizeResult(raw) {
  const score = clampServer(raw.score);
  const dimensions = Object.fromEntries(DIMENSIONS.map((key) => [key, clampServer(raw.dimensions?.[key])]));
  const inferredLevel = score >= 95 ? '自在极意豪' : score >= 80 ? '豪气冲天' : score >= 60 ? '高阶嘉豪' : score >= 40 ? '半步嘉豪' : score >= 20 ? '嘉豪观察对象' : '清澈普通人';
  const list = (value, fallback, count) => Array.isArray(value) ? value.map((item) => cleanText(item, '', 80)).filter(Boolean).slice(0, count) : fallback;
  return {
    score,
    type: TYPES.includes(raw.type) ? raw.type : '潜伏嘉豪',
    level: cleanText(raw.level, inferredLevel, 20),
    verdict: cleanText(raw.verdict, '豪气信号已经出现，具体形态仍在持续观测。', 90),
    dimensions,
    traits: list(raw.traits, ['豪气在线', '细节埋点', '等待追问', '稳定发挥'], 4),
    evidence: list(raw.evidence, ['输入内容出现了明显的嘉豪式表达结构。', '克制表达与表现欲形成了有趣反差。', '细节中存在等待别人主动发现的倾向。'], 3),
    comment: cleanText(raw.comment, '你没有主动展示豪气，但豪气已经从内容边缘自然溢出。建议保持现状，再刻意一点可能就不自然了。', 220),
  };
}

test('normalizeResult clamps score to 0-100', () => {
  assert.equal(normalizeResult({ score: 180 }).score, 100);
  assert.equal(normalizeResult({ score: -50 }).score, 0);
  assert.equal(normalizeResult({ score: 85 }).score, 85);
});

test('normalizeResult fixes invalid type to 潜伏嘉豪', () => {
  const result = normalizeResult({ score: 50, type: '不存在物种' });
  assert.equal(result.type, '潜伏嘉豪');
});

test('normalizeResult accepts all valid types', () => {
  for (const type of TYPES) {
    const result = normalizeResult({ score: 50, type });
    assert.equal(result.type, type);
  }
});

test('normalizeResult clamps dimension values', () => {
  const result = normalizeResult({ score: 50, dimensions: { mystery: -10, flex: 200, niche: 50 } });
  assert.equal(result.dimensions.mystery, 0);
  assert.equal(result.dimensions.flex, 100);
  assert.equal(result.dimensions.niche, 50);
});

test('normalizeResult infers level from score correctly', () => {
  const levels = [
    [0, '清澈普通人'],
    [19, '清澈普通人'],
    [20, '嘉豪观察对象'],
    [39, '嘉豪观察对象'],
    [40, '半步嘉豪'],
    [59, '半步嘉豪'],
    [60, '高阶嘉豪'],
    [79, '高阶嘉豪'],
    [80, '豪气冲天'],
    [94, '豪气冲天'],
    [95, '自在极意豪'],
    [100, '自在极意豪'],
  ];
  for (const [score, expected] of levels) {
    assert.equal(normalizeResult({ score }).level, expected, `score=${score} should be ${expected}`);
  }
});

test('normalizeResult fills missing traits with defaults', () => {
  const result = normalizeResult({ score: 50, traits: ['特性A'] });
  assert.deepEqual(result.traits, ['特性A']);
});

test('normalizeResult fills missing evidence with defaults', () => {
  const result = normalizeResult({ score: 50, evidence: undefined });
  assert.equal(result.evidence.length, 3);
});

test('normalizeResult truncates verdict', () => {
  const result = normalizeResult({ score: 50, verdict: 'x'.repeat(200) });
  assert.ok(result.verdict.length <= 90);
});

test('normalizeResult handles completely empty input', () => {
  const result = normalizeResult({});
  assert.equal(result.score, 50);
  assert.equal(result.type, '潜伏嘉豪');
  assert.ok(result.level);
  assert.ok(result.verdict);
  assert.ok(result.comment);
  assert.ok(result.traits.length === 4);
  assert.ok(result.evidence.length === 3);
});

test('normalizeResult filters empty trait strings', () => {
  const result = normalizeResult({ score: 50, traits: ['A', '', '  ', 'B'] });
  assert.deepEqual(result.traits, ['A', 'B']);
});

// === normalizePkResult tests ===
function normalizePkResult(raw, names, source) {
  const participants = [0, 1].map((index) => ({
    name: names[index],
    ...normalizeResult(raw.participants?.[index] || {}),
    source,
  }));
  const allowedWinner = ['A', 'B', 'tie'];
  return {
    kind: 'pk',
    participants,
    battle: {
      winner: allowedWinner.includes(raw.battle?.winner) ? raw.battle.winner : 'tie',
      title: cleanText(raw.battle?.title, '豪气同频', 20),
      reason: cleanText(raw.battle?.reason, '双方豪气各有路径，这场对决暂时难分高下。', 220),
      decisiveDimensions: Array.isArray(raw.battle?.decisiveDimensions) ? raw.battle.decisiveDimensions.map((item) => cleanText(item, '', 12)).filter(Boolean).slice(0, 3) : [],
      source,
    },
  };
}

test('normalizePkResult sets participant names', () => {
  const result = normalizePkResult(
    { participants: [{ score: 80 }, { score: 75 }], battle: { winner: 'A' } },
    ['甲', '乙'],
    '测试源'
  );
  assert.equal(result.participants[0].name, '甲');
  assert.equal(result.participants[1].name, '乙');
  assert.equal(result.battle.source, '测试源');
});

test('normalizePkResult defaults invalid winner to tie', () => {
  const result = normalizePkResult(
    { participants: [{ score: 80 }, { score: 75 }], battle: { winner: 'invalid' } },
    ['甲', '乙'],
    '测试'
  );
  assert.equal(result.battle.winner, 'tie');
});

test('normalizePkResult accepts A, B, tie as valid winners', () => {
  for (const winner of ['A', 'B', 'tie']) {
    const result = normalizePkResult(
      { participants: [{ score: 80 }, { score: 70 }], battle: { winner } },
      ['A', 'B'],
      'src'
    );
    assert.equal(result.battle.winner, winner);
  }
});

test('normalizePkResult fills missing participants with defaults', () => {
  const result = normalizePkResult({ battle: { winner: 'tie' } }, ['A', 'B'], 'test');
  assert.equal(result.participants.length, 2);
  assert.equal(result.participants[0].score, 50);
  assert.equal(result.participants[1].score, 50);
});

test('normalizePkResult truncates decisive dimensions to 3', () => {
  const result = normalizePkResult(
    { participants: [{ score: 80 }, { score: 70 }], battle: { winner: 'A', decisiveDimensions: ['A', 'B', 'C', 'D', 'E'] } },
    ['甲', '乙'], 'test'
  );
  assert.ok(result.battle.decisiveDimensions.length <= 3);
});

test('normalizePkResult filters empty decisive dimensions', () => {
  const result = normalizePkResult(
    { participants: [{ score: 80 }, { score: 70 }], battle: { winner: 'A', decisiveDimensions: ['A', '', '  ', null] } },
    ['甲', '乙'], 'test'
  );
  assert.deepEqual(result.battle.decisiveDimensions, ['A']);
});

// === validImages tests ===
function validImages(value, maximum = 9) {
  return (Array.isArray(value) ? value : []).filter((image) => typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(image)).slice(0, maximum);
}

test('validImages filters valid base64 image strings', () => {
  const valid = 'data:image/jpeg;base64,AA==';
  const validPng = 'data:image/png;base64,AA==';
  const validWebp = 'data:image/webp;base64,AA==';
  const result = validImages([valid, validPng, validWebp, 'not-an-image', 'https://example.com/img.jpg', 123, null]);
  assert.equal(result.length, 3);
  assert.deepEqual(result, [valid, validPng, validWebp]);
});

test('validImages caps at maximum', () => {
  const images = Array(15).fill('data:image/jpeg;base64,AA==');
  assert.equal(validImages(images, 3).length, 3);
  assert.equal(validImages(images).length, 9);
});

test('validImages handles non-array input', () => {
  assert.deepEqual(validImages(null), []);
  assert.deepEqual(validImages(undefined), []);
  assert.deepEqual(validImages('string'), []);
  assert.deepEqual(validImages({}), []);
});

test('validImages rejects non-base64 image formats', () => {
  assert.equal(validImages(['data:image/gif;base64,AA==']).length, 0);
  assert.equal(validImages(['data:image/svg+xml;base64,AA==']).length, 0);
});

// === getProvider tests ===
function getProvider(isVision, env = {}) {
  if (isVision) {
    return {
      id: 'ark',
      base: (env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''),
      model: env.ARK_MODEL || 'doubao-seed-2-0-mini-260428',
      key: env.ARK_API_KEY,
      source: '云端多模态大模型',
      prices: { input: env.ARK_INPUT_CNY_PER_MILLION, output: env.ARK_OUTPUT_CNY_PER_MILLION, cachedInput: env.ARK_CACHED_INPUT_CNY_PER_MILLION },
    };
  }
  return {
    id: 'deepseek',
    base: (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    key: env.DEEPSEEK_API_KEY,
    source: '云端文字大模型',
    prices: { input: env.DEEPSEEK_INPUT_CNY_PER_MILLION, output: env.DEEPSEEK_OUTPUT_CNY_PER_MILLION, cachedInput: env.DEEPSEEK_CACHED_INPUT_CNY_PER_MILLION },
  };
}

test('getProvider returns deepseek for text mode', () => {
  const provider = getProvider(false);
  assert.equal(provider.id, 'deepseek');
  assert.equal(provider.source, '云端文字大模型');
  assert.ok(provider.base.includes('deepseek.com'));
});

test('getProvider returns ark for vision mode', () => {
  const provider = getProvider(true);
  assert.equal(provider.id, 'ark');
  assert.equal(provider.source, '云端多模态大模型');
  assert.ok(provider.base.includes('volces.com'));
});

test('getProvider uses environment overrides', () => {
  const env = {
    DEEPSEEK_BASE_URL: 'https://custom.deepseek.com/v1/',
    DEEPSEEK_MODEL: 'custom-model',
    DEEPSEEK_API_KEY: 'sk-custom',
    DEEPSEEK_INPUT_CNY_PER_MILLION: '1.5',
    DEEPSEEK_OUTPUT_CNY_PER_MILLION: '6.0',
  };
  const provider = getProvider(false, env);
  assert.equal(provider.base, 'https://custom.deepseek.com/v1');
  assert.equal(provider.model, 'custom-model');
  assert.equal(provider.key, 'sk-custom');
  assert.equal(provider.prices.input, '1.5');
  assert.equal(provider.prices.output, '6.0');
});

test('getProvider strips trailing slash from base URL', () => {
  const env = { DEEPSEEK_BASE_URL: 'https://api.deepseek.com/' };
  const provider = getProvider(false, env);
  assert.equal(provider.base, 'https://api.deepseek.com');
});

// === cookie function tests ===
function cookie(name, value, maxAge, req, sameSite = 'Lax') {
  const secure = false;
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}`;
}

test('cookie produces valid cookie string', () => {
  const c = cookie('test', 'value', 3600, { headers: {} });
  assert.ok(c.includes('test=value'));
  assert.ok(c.includes('Path=/'));
  assert.ok(c.includes('Max-Age=3600'));
  assert.ok(c.includes('HttpOnly'));
  assert.ok(c.includes('SameSite=Lax'));
});

test('cookie encodes special characters', () => {
  const c = cookie('key', 'value with space', 3600, { headers: {} });
  assert.ok(c.includes('value%20with%20space'));
});

test('cookie uses Strict when specified', () => {
  const c = cookie('key', 'val', 3600, { headers: {} }, 'Strict');
  assert.ok(c.includes('SameSite=Strict'));
});
