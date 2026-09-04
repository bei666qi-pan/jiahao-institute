import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';

const SLOTS = new Set(['text', 'vision', 'image', 'video']);
const PROVIDERS = new Set(['minimax', 'volcengine', 'openai-compatible']);

function encryptionKey(secret) {
  if (String(secret || '').length < 12) throw Object.assign(new Error('AI 配置加密密钥未配置'), { statusCode: 503 });
  return createHash('sha256').update(String(secret)).digest();
}

export function sealSecret(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') };
}

export function openSecret(payload, secret) {
  const sealed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
}

export function normalizeAiConfig(slot, input = {}) {
  if (!SLOTS.has(slot)) throw Object.assign(new Error('AI 配置类型无效'), { statusCode: 400 });
  const provider = String(input.provider || '').trim();
  const baseUrl = String(input.baseUrl || '').trim().replace(/\/$/, '');
  const model = String(input.model || '').trim();
  const apiKey = String(input.apiKey || '').trim();
  if (!PROVIDERS.has(provider)) throw Object.assign(new Error('暂不支持该 AI 供应商'), { statusCode: 400 });
  try { if (!/^https:$/.test(new URL(baseUrl).protocol)) throw new Error(); } catch { throw Object.assign(new Error('服务地址必须是 HTTPS'), { statusCode: 400 }); }
  if (model.length < 2 || model.length > 100) throw Object.assign(new Error('模型名称无效'), { statusCode: 400 });
  if (apiKey.length < 6 || apiKey.length > 500) throw Object.assign(new Error('API 密钥无效'), { statusCode: 400 });
  const options = slot === 'video' ? {
    queryUrl: String(input.queryUrl || input.options?.queryUrl || '').trim(), fileUrl: String(input.fileUrl || input.options?.fileUrl || '').trim(), enabled: input.enabled !== false && input.options?.enabled !== false,
  } : {};
  if (slot === 'video' && (!options.queryUrl || !options.fileUrl)) throw Object.assign(new Error('请完整填写视频任务与文件查询地址'), { statusCode: 400 });
  for (const value of [options.queryUrl, options.fileUrl].filter(Boolean)) {
    try { if (new URL(value).protocol !== 'https:') throw new Error(); } catch { throw Object.assign(new Error('视频查询地址必须是 HTTPS'), { statusCode: 400 }); }
  }
  return { slot, provider, baseUrl, model, apiKey, options };
}

export async function testAiConnectivity(config, fetchImpl = fetch) {
  const started = Date.now();
  let response;
  if (config.slot === 'text' || config.slot === 'vision') {
    response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: '只回复 OK' }], max_tokens: 5, temperature: 0 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw Object.assign(new Error(`连通测试失败（HTTP ${response.status}）`), { statusCode: 400 });
    const data = await response.json().catch(() => ({}));
    if (!data.choices?.[0]?.message) throw Object.assign(new Error('模型未返回有效消息'), { statusCode: 400 });
  } else {
    response = await fetchImpl(config.baseUrl, { method: 'GET', headers: { Authorization: `Bearer ${config.apiKey}` }, signal: AbortSignal.timeout(12_000) });
    const data = await response.clone().json().catch(() => ({}));
    const providerCode = Number(data?.base_resp?.status_code || data?.error?.code || 0);
    if ([401, 403].includes(response.status) || [1004, 2049].includes(providerCode)) throw Object.assign(new Error('API 密钥鉴权失败'), { statusCode: 400 });
    if (response.status === 404) throw Object.assign(new Error('供应商服务地址不存在'), { statusCode: 400 });
    if (response.status >= 500) throw Object.assign(new Error(`供应商暂时不可用（HTTP ${response.status}）`), { statusCode: 503 });
  }
  return { latencyMs: Date.now() - started };
}

function envFallback(slot, env) {
  if (slot === 'text') {
    const minimax = env.MINIMAX_TEXT_API_KEY;
    return minimax ? { slot, provider: 'minimax', baseUrl: (env.MINIMAX_TEXT_BASE_URL || 'https://api.minimax.cn/v1').replace(/\/$/, ''), model: env.MINIMAX_TEXT_MODEL || 'MiniMax-M3', apiKey: minimax, options: {} }
      : { slot, provider: 'openai-compatible', baseUrl: (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''), model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash', apiKey: env.DEEPSEEK_API_KEY || '', options: {} };
  }
  if (slot === 'vision') {
    if (env.MINIMAX_TEXT_API_KEY) return { slot, provider: 'minimax', baseUrl: (env.MINIMAX_TEXT_BASE_URL || 'https://api.minimax.cn/v1').replace(/\/$/, ''), model: env.MINIMAX_TEXT_MODEL || 'MiniMax-M3', apiKey: env.MINIMAX_TEXT_API_KEY, options: {} };
    return { slot, provider: 'volcengine', baseUrl: (env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''), model: env.ARK_MODEL || 'doubao-seed-2-0-mini-260428', apiKey: env.ARK_API_KEY || env.ARK_IMAGE_API_KEY || '', options: {} };
  }
  if (slot === 'image') return { slot, provider: 'volcengine', baseUrl: env.ARK_IMAGE_URL || 'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations', model: env.ARK_IMAGE_MODEL || 'doubao-seedream-5.0-lite', apiKey: env.ARK_IMAGE_API_KEY || env.ARK_API_KEY || '', options: {} };
  const base = (env.MINIMAX_VIDEO_BASE_URL || 'https://api.minimaxi.com').replace(/\/$/, '');
  return { slot, provider: 'minimax', baseUrl: env.MINIMAX_VIDEO_URL || `${base}/v1/video_generation`, model: env.MINIMAX_VIDEO_MODEL || 'MiniMax-Hailuo-2.3', apiKey: env.MINIMAX_VIDEO_API_KEY || env.MINIMAX_API_KEY || '', options: { queryUrl: env.MINIMAX_VIDEO_QUERY_URL || `${base}/v1/query/video_generation`, fileUrl: env.MINIMAX_VIDEO_FILE_URL || `${base}/v1/files/retrieve`, enabled: env.MINIMAX_VIDEO_ENABLED !== 'false' } };
}

export class AiConfigService {
  constructor(env = process.env, database = null, options = {}) {
    this.env = env;
    this.database = database;
    this.secret = env.AI_CONFIG_ENCRYPTION_KEY || env.ADMIN_PASSWORD || '';
    this.pending = new Map();
    this.cache = new Map();
    this.now = options.now || Date.now;
    this.testConnection = options.testConnection || testAiConnectivity;
  }

  async test(slot, input) {
    const config = normalizeAiConfig(slot, input);
    const result = await this.testConnection(config);
    const testToken = randomUUID();
    this.pending.set(testToken, { config, expiresAt: this.now() + 5 * 60_000 });
    return { tested: true, testToken, latencyMs: result.latencyMs, provider: config.provider, model: config.model };
  }

  async activate(testToken) {
    const pending = this.pending.get(String(testToken || ''));
    if (!pending) throw Object.assign(new Error('测试凭据无效或已使用'), { statusCode: 400 });
    this.pending.delete(String(testToken));
    if (pending.expiresAt < this.now()) throw Object.assign(new Error('测试凭据已过期，请重新测试'), { statusCode: 400 });
    if (!this.database) throw Object.assign(new Error('AI 配置存储未启用'), { statusCode: 503 });
    const config = pending.config;
    const sealed = sealSecret(config.apiKey, this.secret);
    await this.database.query(`insert into jh_ai_configurations
      (slot,provider,base_url,model,encrypted_api_key,options,tested_at,activated_at)
      values ($1,$2,$3,$4,$5,$6::jsonb,now(),now())
      on conflict (slot) do update set provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,
        encrypted_api_key=excluded.encrypted_api_key,options=excluded.options,tested_at=now(),activated_at=now(),updated_at=now()`,
    [config.slot, config.provider, config.baseUrl, config.model, JSON.stringify(sealed), JSON.stringify(config.options || {})]);
    this.cache.set(config.slot, config);
    return { activated: true, config: this.toPublic(config, new Date(this.now()).toISOString()) };
  }

  toPublic(config, activatedAt = null) {
    return { slot: config.slot, provider: config.provider, baseUrl: config.baseUrl, model: config.model, keyConfigured: Boolean(config.apiKey), options: config.options || {}, activatedAt };
  }

  async runtime(slot) {
    if (!SLOTS.has(slot)) throw new Error('AI 配置类型无效');
    if (this.cache.has(slot)) return this.cache.get(slot);
    if (this.database) {
      const result = await this.database.query('select * from jh_ai_configurations where slot=$1', [slot]);
      if (result.rowCount) {
        const row = result.rows[0];
        const config = { slot, provider: row.provider, baseUrl: row.base_url, model: row.model, apiKey: openSecret(row.encrypted_api_key, this.secret), options: row.options || {} };
        this.cache.set(slot, config);
        return config;
      }
    }
    return envFallback(slot, this.env);
  }

  async list() {
    const rows = this.database ? (await this.database.query('select slot,provider,base_url,model,options,activated_at from jh_ai_configurations order by slot')).rows : [];
    const stored = new Map(rows.map((row) => [row.slot, row]));
    return { encryptionConfigured: String(this.secret).length >= 12, configs: await Promise.all([...SLOTS].map(async (slot) => {
      const row = stored.get(slot);
      if (row) return { slot, provider: row.provider, baseUrl: row.base_url, model: row.model, keyConfigured: true, options: row.options || {}, activatedAt: row.activated_at };
      return { ...this.toPublic(envFallback(slot, this.env)), source: 'environment' };
    })) };
  }
}
