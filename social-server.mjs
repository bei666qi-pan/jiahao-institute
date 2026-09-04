import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { aiConfigService, closeServerResources, server } from './server.mjs';
import { Observability } from './server/observability.mjs';
import { handleQuoteRequest, QUOTE_SERVICE_VERSION } from './server/quote.mjs';
import { SocialService, signSocialResult } from './server/social.mjs';
import { signReactionResult } from './server/reaction-token.mjs';
import { createLeagueJudge } from './server/league.mjs';

const PORT = Number(process.env.PORT || 8080);
const signingSecret = process.env.SOCIAL_SIGNING_SECRET
  || process.env.ADMIN_PASSWORD
  || process.env.DEEPSEEK_API_KEY
  || process.env.ARK_API_KEY
  || '';

const maintenance = new Observability();
const social = new SocialService(process.env, signingSecret, {
  recordLeagueEvent: (req, name, properties) => maintenance.recordProductEvent(req, { name, properties }),
  judgeLeagueAnswer: createLeagueJudge(process.env, fetch, async () => {
    const config = await aiConfigService.runtime('text');
    return { id: config.provider, base: config.baseUrl, model: config.model, key: config.apiKey, source: '云端文字大模型', prices: {} };
  }),
});

try {
  await maintenance.init();
  void Promise.all([maintenance.maintain(), social.maintain()]);
  setInterval(() => void Promise.all([maintenance.maintain(), social.maintain()]), 60 * 60 * 1000).unref();
} catch (error) {
  console.error(`数据库初始化失败：${String(error?.message || '未知错误').slice(0, 160)}`);
}

const originalRequestHandler = server.listeners('request')[0];
if (!originalRequestHandler) throw new Error('未找到原始 HTTP 请求处理器');
server.removeAllListeners('request');

function appendJsonFields(res, fields, predicate = () => true) {
  const originalEnd = res.end.bind(res);
  res.end = (chunk, encoding, callback) => {
    let output = chunk;
    if (res.statusCode >= 200 && res.statusCode < 300 && chunk) {
      try {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        const payload = JSON.parse(text);
        if (payload && predicate(payload)) output = JSON.stringify({ ...payload, ...fields(payload) });
      } catch {
        // 非 JSON 响应保持原样。
      }
    }
    return originalEnd(output, encoding, callback);
  };
}

function attachResultSignature(res) {
  appendJsonFields(res, (payload) => {
    const resultToken = signingSecret ? signSocialResult(payload, signingSecret) : null;
    return resultToken ? { resultToken } : {};
  }, (payload) => Number.isFinite(Number(payload.score)) && payload.dimensions);
}

server.on('request', async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (await social.handle(req, res, url)) return;
  if (req.method === 'POST' && url.pathname === '/api/quote') {
    return handleQuoteRequest(req, res, maintenance, { providerResolver: async () => {
      const config = await aiConfigService.runtime('text');
      return { id: config.provider, base: config.baseUrl, model: config.model, key: config.apiKey, source: '云端文字大模型', prices: {} };
    } });
  }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    appendJsonFields(res, () => ({
      quoteServiceVersion: QUOTE_SERVICE_VERSION,
      league: { enabled: social.leagueEnabled, databaseConfigured: social.enabled, promptCount: 28 },
    }));
  }
  if (req.method === 'POST' && url.pathname === '/api/analyze') attachResultSignature(res);
  if (req.method === 'POST' && url.pathname === '/api/reactions/score') {
    appendJsonFields(res, (payload) => {
      const credential = signingSecret ? signReactionResult(payload, signingSecret) : null;
      return credential ? { credential } : {};
    }, (payload) => payload?.kind === 'reaction');
  }
  return originalRequestHandler(req, res);
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, '::', () => {
    console.log(`嘉豪鉴定服务已启动：${PORT}（好友榜已接入）`);
  });
}

export { server };

export async function closeSocialResources() {
  await Promise.all([
    social.pool?.end(),
    maintenance.close(),
    closeServerResources(),
  ]);
}
