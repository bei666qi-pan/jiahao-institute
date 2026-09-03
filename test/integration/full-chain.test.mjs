// Full-chain integration test: mock model server + real HTTP server
// Tests the complete pipeline: request → model → normalization → response
import test from 'node:test';
import assert from 'node:assert/strict';
import { startMockServer } from '../helpers/mock-model-server.mjs';

const originalEnv = { ...process.env };

function setupEnv(mockUrl) {
  delete process.env.DATABASE_URL;
  delete process.env.ADMIN_PASSWORD;
  process.env.PORT = '0';
  // Point model APIs to mock server
  process.env.DEEPSEEK_BASE_URL = `${mockUrl}/`;
  process.env.DEEPSEEK_API_KEY = 'mock-key-12345';
  process.env.DEEPSEEK_MODEL = 'mock-model';
  process.env.DEEPSEEK_INPUT_CNY_PER_MILLION = '2';
  process.env.DEEPSEEK_OUTPUT_CNY_PER_MILLION = '8';
  process.env.DEEPSEEK_CACHED_INPUT_CNY_PER_MILLION = '0.5';
  // Image generation uses the Agent Plan key while multimodal chat keeps the
  // standard Ark endpoint and credential; the namespaces are not interchangeable.
  process.env.ARK_BASE_URL = mockUrl;
  process.env.ARK_IMAGE_URL = `${mockUrl}/images/generations`;
  process.env.ARK_API_KEY = 'mock-key-vision';
  process.env.ARK_IMAGE_API_KEY = 'mock-key-67890';
  process.env.ARK_MODEL = 'mock-vision-model';
  process.env.ARK_INPUT_CNY_PER_MILLION = '2';
  process.env.ARK_OUTPUT_CNY_PER_MILLION = '8';
  process.env.ARK_CACHED_INPUT_CNY_PER_MILLION = '0.5';
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    process.env[key] = value;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, headers: response.headers, body };
}

let serverUrl = '';
let serverInstance = null;
let mockServer = null;

test.before(async () => {
  // Start mock model server
  mockServer = await startMockServer(0);

  // Set env to use mock server
  setupEnv(mockServer.url);

  // Clear module cache to pick up new env
  const modulePath = '../../server.mjs';
  // Dynamic import — the module will use the new env vars
  const module = await import(modulePath);
  const { server } = module;

  await new Promise((resolve) => {
    serverInstance = server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      serverUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (serverInstance) serverInstance.close();
  if (mockServer) await mockServer.close();
  restoreEnv();
});

// === Health Check ===
test('healthz reports models configured', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/healthz`);
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.textModelConfigured, true);
  assert.equal(body.visionModelConfigured, true);
  assert.equal(body.textModel, 'mock-model');
  assert.equal(body.visionModel, 'mock-vision-model');
});

// === Full-chain: Text Analyze ===
test('POST /api/analyze returns complete normalized result', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/analyze`, {
    method: 'POST',
    body: JSON.stringify({ input: '今天天气不错，有点想哭。', mode: 'text' }),
  });

  assert.equal(status, 200);

  // Verify structure
  assert.ok(typeof body.score === 'number' && body.score >= 0 && body.score <= 100);
  assert.ok(body.type, 'Should have type');
  assert.ok(body.level, 'Should have level');
  assert.ok(body.verdict, 'Should have verdict');
  assert.ok(Array.isArray(body.traits) && body.traits.length > 0);
  assert.ok(Array.isArray(body.evidence) && body.evidence.length > 0);
  assert.ok(body.comment, 'Should have comment');
  assert.ok(body.dimensions, 'Should have dimensions');
  assert.ok(body.source, 'Should have source');

  // Source should indicate cloud model was used
  assert.ok(body.source.includes('云端'));
});

test('POST /api/analyze accepts photo input when the shared Ark image key is configured', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/analyze`, {
    method: 'POST',
    body: JSON.stringify({
      input: '请鉴定这张图片',
      mode: 'photo',
      images: ['data:image/png;base64,iVBORw0KGgo='],
    }),
  });

  assert.equal(status, 200);
  assert.equal(body.type, '深情破碎豪');
  assert.equal(body.source, '云端多模态大模型 · 规则计分');
});

// === Full-chain: PK Analyze ===
test('POST /api/pk returns complete PK result', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/pk`, {
    method: 'POST',
    body: JSON.stringify({
      participants: [
        { name: '小明', input: '我的代码跑通了', mode: 'text' },
        { name: '小红', input: '今天咖啡不错', mode: 'text' },
      ],
    }),
  });

  assert.equal(status, 200);

  // Verify PK structure
  assert.equal(body.kind, 'pk');
  assert.equal(body.participants.length, 2);
  assert.equal(body.participants[0].name, '小明');
  assert.equal(body.participants[1].name, '小红');

  // Battle result
  assert.ok(['A', 'B', 'tie'].includes(body.battle.winner));
  assert.ok(body.battle.title);
  assert.ok(body.battle.reason);
  assert.ok(Array.isArray(body.battle.decisiveDimensions));
});

// === Full-chain: Quote Generator ===
test('POST /api/quote returns generated quote', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/quote`, {
    method: 'POST',
    body: JSON.stringify({ input: '今天很累。', mode: 'hao', level: '豪气冲天', style: '高冷' }),
  });

  assert.equal(status, 200);
  assert.ok(body.output, 'Should have output');
  assert.ok(body.output.length >= 2, 'Output should be at least 2 characters');
  assert.ok(body.source, 'Should have source');
});

// === Error: Missing participant in PK ===
test('POST /api/pk with invalid participant count returns error', async () => {
  const { status, body } = await fetchJson(`${serverUrl}/api/pk`, {
    method: 'POST',
    body: JSON.stringify({ participants: [{ name: '单方面', input: 'test', mode: 'text' }] }),
  });

  assert.equal(status, 503);
  assert.ok(body.error);
});

// === Security: Headers on API response ===
test('API responses include security headers', async () => {
  const response = await fetch(`${serverUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: 'test', mode: 'text' }),
  });
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

// === Verify mock was called ===
test('Mock model server received calls', () => {
  assert.ok(mockServer.callCount >= 3, `Expected at least 3 calls, got ${mockServer.callCount}`);
});
