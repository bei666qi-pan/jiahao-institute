import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { server } from './server.mjs';
import { Observability } from './server/observability.mjs';
import { SocialService, signSocialResult } from './server/social.mjs';

const PORT = Number(process.env.PORT || 8080);
const signingSecret = process.env.SOCIAL_SIGNING_SECRET
  || process.env.ADMIN_PASSWORD
  || process.env.DEEPSEEK_API_KEY
  || process.env.ARK_API_KEY
  || '';

const maintenance = new Observability();
const social = new SocialService(process.env, signingSecret);

try {
  await maintenance.init();
  void maintenance.maintain();
  setInterval(() => void maintenance.maintain(), 60 * 60 * 1000).unref();
} catch (error) {
  console.error(`数据库初始化失败：${String(error?.message || '未知错误').slice(0, 160)}`);
}

const originalRequestHandler = server.listeners('request')[0];
if (!originalRequestHandler) throw new Error('未找到原始 HTTP 请求处理器');
server.removeAllListeners('request');

function attachResultSignature(res) {
  const originalEnd = res.end.bind(res);
  res.end = (chunk, encoding, callback) => {
    let output = chunk;
    if (res.statusCode >= 200 && res.statusCode < 300 && chunk && signingSecret) {
      try {
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        const payload = JSON.parse(text);
        if (payload && Number.isFinite(Number(payload.score)) && payload.dimensions) {
          const resultToken = signSocialResult(payload, signingSecret);
          if (resultToken) output = JSON.stringify({ ...payload, resultToken });
        }
      } catch {
        // 非 JSON 或非鉴定响应保持原样。
      }
    }
    return originalEnd(output, encoding, callback);
  };
}

server.on('request', async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (await social.handle(req, res, url)) return;
  if (req.method === 'POST' && url.pathname === '/api/analyze') attachResultSignature(res);
  return originalRequestHandler(req, res);
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, '::', () => {
    console.log(`嘉豪鉴定服务已启动：${PORT}（好友榜已接入）`);
  });
}
