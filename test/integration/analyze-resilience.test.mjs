// Analyze should accept a valid JSON object even when an upstream model appends prose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../helpers/mock-model-server.mjs';

const originalEnv = { ...process.env };

function setupEnv(mockUrl) {
  delete process.env.DATABASE_URL;
  delete process.env.ADMIN_PASSWORD;
  process.env.PORT = '0';
  process.env.MINIMAX_TEXT_BASE_URL = mockUrl;
  process.env.MINIMAX_TEXT_API_KEY = 'mock-minimax-key';
  process.env.MINIMAX_TEXT_MODEL = 'MiniMax-M3';
  process.env.ARK_BASE_URL = mockUrl;
  process.env.ARK_API_KEY = 'mock-ark-key';
  process.env.ARK_MODEL = 'mock-ark-model';
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  return { status: response.status, body: await response.json() };
}

let serverUrl = '';
let serverInstance = null;
let mockServer = null;

test.before(async () => {
  mockServer = await startMockServer(0, {
    analyzeContentSuffix: ({ callCount }) => callCount === 1 ? '\n{"note":"以上为娱乐鉴定"}' : '',
  });
  setupEnv(mockServer.url);
  const { server } = await import('../../server.mjs');
  await new Promise((resolve) => {
    serverInstance = server.listen(0, '127.0.0.1', () => {
      const { port } = serverInstance.address();
      serverUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (serverInstance) serverInstance.close();
  if (mockServer) await mockServer.close();
  restoreEnv();
});

test('POST /api/analyze accepts a valid JSON object followed by model prose', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/analyze`, {
    method: 'POST',
    body: JSON.stringify({ mode: 'text', input: '今天下雨，我带了伞。' }),
  });

  assert.equal(status, 200);
  assert.equal(typeof body.score, 'number');
  assert.ok(body.dimensions);
});

test('POST /api/analyze disables reasoning and caps the upstream completion', async () => {
  const { status } = await fetchJson(`${serverUrl}/api/analyze`, {
    method: 'POST',
    body: JSON.stringify({ mode: 'text', input: '今天下雨，我带了伞。' }),
  });

  assert.equal(status, 200);
  const request = mockServer.calls.at(-1).request;
  assert.deepEqual(request.thinking, { type: 'disabled' });
  assert.equal(request.max_tokens, 1200);
});

test('POST /api/analyze uses MiniMax directly for photo analysis', async () => {
  const callsBeforeRequest = mockServer.calls.length;
  const { status, body } = await fetchJson(`${serverUrl}/api/analyze`, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'photo',
      input: '请鉴定这张图片',
      images: ['data:image/png;base64,iVBORw0KGgo='],
    }),
  });

  assert.equal(status, 200);
  assert.equal(body.type, '深情破碎豪');
  assert.equal(body.source, '云端多模态大模型 · 规则计分');
  assert.deepEqual(mockServer.calls.slice(callsBeforeRequest).map((call) => call.model), ['MiniMax-M3']);
});
