import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 8080);
const DIST_DIR = fileURLToPath(new URL('./dist', import.meta.url));
const TEXT_API_BASE = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const TEXT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const TEXT_API_KEY = process.env.DEEPSEEK_API_KEY;
const VISION_API_BASE = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
const VISION_MODEL = process.env.ARK_MODEL || 'doubao-seed-2-0-mini-260428';
const VISION_API_KEY = process.env.ARK_API_KEY;
const MAX_BODY_BYTES = 28 * 1024 * 1024;

const DIMENSIONS = ['mystery', 'flex', 'niche', 'deep', 'show', 'language'];
const TYPES = ['自在极意豪', '美式嘉豪', '深情破碎豪', '计算机嘉豪', '股票嘉豪', '不懂装懂豪', '小众优越豪', '潜伏嘉豪', '反向嘉豪', '无意炫耀豪'];

const SYSTEM_PROMPT = `你是“嘉豪鉴定所”的娱乐鉴定官。你的任务是识别网络语境里的嘉豪风格，必须幽默、具体、友善，不评价长相，不侮辱用户，不推断种族、疾病、性别、政治倾向等敏感属性，也不得把结果描述成科学事实。

嘉豪物种参考：
- 自在极意豪：黑口罩、白色无线耳机、低头侧脸、越不解释越有戏。
- 美式嘉豪：墨镜、棒球夹克、冰美式、自以为很潮、走路像拍音乐短片。
- 计算机嘉豪：喜欢计算机、终端、配置、键盘轴体，张口就是底层原理。
- 股票嘉豪：喜欢股票、行情线、仓位、宏观叙事，涨跌都能解释。
- 不懂装懂豪：术语密度很高，常说底层逻辑、闭环、赋能，细问就转场。
- 深情破碎豪：深夜、侧脸、嘴上无所谓、歌单循环。
- 小众优越豪：懂的都懂、拒绝主流、等待别人追问。
- 潜伏嘉豪：表面正常，细节埋点，静默蓄力。
- 反向嘉豪：持续否认，但越描越豪。

只返回一个合法 JSON 对象，不要 Markdown，不要解释。严格结构：
{
  "score": 0到100的整数,
  "type": "从给定物种中选一个",
  "level": "清澈普通人/嘉豪观察对象/半步嘉豪/高阶嘉豪/豪气冲天/自在极意豪",
  "verdict": "一句20到45字的鉴定结论",
  "dimensions": {"mystery":整数,"flex":整数,"niche":整数,"deep":整数,"show":整数,"language":整数},
  "traits": ["四个具体短特征"],
  "evidence": ["三条基于输入内容的具体判定依据"],
  "comment": "一段50到100字的嘉豪式友善总评"
}`;

const PK_SYSTEM_PROMPT = `你是“嘉豪鉴定所”的双人豪气裁决官。你会收到两名选手可能不同类型的素材。请分别按照同一套六维标准完成娱乐分析，再基于表达、构图叙事、信息留白、镜头掌控与豪言风格做综合裁决。胜者不必机械等于总分更高者，但理由必须具体、友善、可解释；实力接近时可以判平局。

安全规则：只分析素材呈现出的表达风格，不评价长相或身体，不推断身份、种族、疾病、性别、政治倾向等敏感属性，不侮辱任何人，不把结果描述成科学事实。

嘉豪物种只能从以下列表选择：自在极意豪、美式嘉豪、深情破碎豪、计算机嘉豪、股票嘉豪、不懂装懂豪、小众优越豪、潜伏嘉豪、反向嘉豪、无意炫耀豪。

只返回一个合法 JSON 对象，不要 Markdown，不要解释。严格结构：
{
  "participants": [
    {"score":整数,"type":"物种","level":"等级","verdict":"20到45字","dimensions":{"mystery":整数,"flex":整数,"niche":整数,"deep":整数,"show":整数,"language":整数},"traits":["四项"],"evidence":["三项"],"comment":"50到100字"},
    {"score":整数,"type":"物种","level":"等级","verdict":"20到45字","dimensions":{"mystery":整数,"flex":整数,"niche":整数,"deep":整数,"show":整数,"language":整数},"traits":["四项"],"evidence":["三项"],"comment":"50到100字"}
  ],
  "battle": {"winner":"A或B或tie","title":"12字以内","reason":"40到100字","decisiveDimensions":["一到三个中文维度名"]}
}`;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

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
    if (size > MAX_BODY_BYTES) throw new Error('内容体积超过限制');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function clamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 50;
}

function cleanText(value, fallback, max = 240) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

export function normalizeResult(raw) {
  const score = clamp(raw.score);
  const dimensions = Object.fromEntries(DIMENSIONS.map((key) => [key, clamp(raw.dimensions?.[key])]));
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

export function normalizePkResult(raw, names, source) {
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

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回有效结构');
  return JSON.parse(text.slice(start, end + 1));
}

function getProvider(isVision) {
  return isVision
    ? { base: VISION_API_BASE, model: VISION_MODEL, key: VISION_API_KEY, source: '云端多模态大模型' }
    : { base: TEXT_API_BASE, model: TEXT_MODEL, key: TEXT_API_KEY, source: '云端文字大模型' };
}

export function validImages(value, maximum = 9) {
  return (Array.isArray(value) ? value : []).filter((image) => typeof image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(image)).slice(0, maximum);
}

async function requestModel(provider, systemPrompt, content) {
  if (!provider.key) throw new Error(provider.model === VISION_MODEL ? '多模态大模型尚未配置' : '文字大模型尚未配置');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 42000);
  try {
    const response = await fetch(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: provider.model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }], temperature: 0.85, response_format: { type: 'json_object' } }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`大模型请求失败（${response.status}）`);
    const data = await response.json();
    const contentText = data.choices?.[0]?.message?.content;
    if (typeof contentText !== 'string') throw new Error('大模型返回内容为空');
    return extractJson(contentText);
  } finally { clearTimeout(timeout); }
}

async function analyzeWithModel(payload) {
  const isVision = payload.mode === 'photo' || payload.mode === 'chat';
  const provider = getProvider(isVision);
  const modeLabel = payload.mode === 'photo' ? '照片鉴定' : payload.mode === 'chat' ? '聊天记录鉴定' : '文字鉴定';
  const userText = cleanText(payload.input, payload.mode === 'text' ? '用户未提供有效文字' : '请结合图片内容进行鉴定', 1200);
  const extractedText = cleanText(payload.extractedText, '', 20_000);
  const content = [{ type: 'text', text: `鉴定方式：${modeLabel}\n用户内容：${userText}\n文件提取内容：${extractedText || '无'}\n请严格按要求生成娱乐鉴定 JSON。` }];
  for (const image of validImages(payload.images)) content.push({ type: 'image_url', image_url: { url: image } });
  return { ...normalizeResult(await requestModel(provider, SYSTEM_PROMPT, content)), source: provider.source };
}

async function analyzePkWithModel(payload) {
  if (!Array.isArray(payload.participants) || payload.participants.length !== 2) throw new Error('PK 必须提交两名选手');
  const participants = payload.participants.map((participant, index) => ({
    name: cleanText(participant.name, `选手 ${index === 0 ? 'A' : 'B'}`, 20),
    mode: ['photo', 'chat', 'text'].includes(participant.mode) ? participant.mode : 'text',
    input: cleanText(participant.input, '', 1200),
    extractedText: cleanText(participant.extractedText, '', 20_000),
    images: validImages(participant.images),
  }));
  const isVision = participants.some((participant) => participant.images.length > 0);
  const provider = getProvider(isVision);
  const content = [];
  participants.forEach((participant, index) => {
    content.push({ type: 'text', text: `\n选手 ${index === 0 ? 'A' : 'B'}\n名称：${participant.name}\n输入类型：${participant.mode}\n文字：${participant.input || '无'}\n文件提取内容：${participant.extractedText || '无'}\n以下图片均属于该选手：` });
    participant.images.forEach((image) => content.push({ type: 'image_url', image_url: { url: image } }));
  });
  content.push({ type: 'text', text: '请严格按要求分别分析并完成综合裁决。' });
  const raw = await requestModel(provider, PK_SYSTEM_PROMPT, content);
  return normalizePkResult(raw, participants.map((participant) => participant.name), provider.source === '云端多模态大模型' ? '模型综合裁决 · 多模态' : '模型综合裁决 · 文字');
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = join(DIST_DIR, safePath);
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(DIST_DIR, 'index.html');
  }
  const body = await readFile(filePath);
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=604800, immutable',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') return sendJson(res, 200, {
      status: 'ok',
      textModelConfigured: Boolean(TEXT_API_KEY),
      visionModelConfigured: Boolean(VISION_API_KEY),
      textModel: TEXT_MODEL,
      visionModel: VISION_MODEL,
    });
    if (req.method === 'POST' && req.url === '/api/analyze') {
      const payload = await readJson(req);
      const result = await analyzeWithModel(payload);
      return sendJson(res, 200, result);
    }
    if (req.method === 'POST' && req.url === '/api/pk') {
      const payload = await readJson(req);
      const result = await analyzePkWithModel(payload);
      return sendJson(res, 200, result);
    }
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res);
    return sendJson(res, 405, { error: '不支持的请求方式' });
  } catch (error) {
    const message = error?.name === 'AbortError' ? '大模型响应超时' : cleanText(error?.message, '服务暂时不可用', 100);
    return sendJson(res, message.includes('体积') ? 413 : 503, { error: message });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, '::', () => {
    console.log(`嘉豪鉴定服务已启动：${PORT}`);
  });
}
