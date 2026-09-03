import "dotenv/config";
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateEstimatedCost, Observability } from './server/observability.mjs';
import { loginAdmin, logoutAdmin, verifyAdmin } from './server/admin-auth.mjs';
import { generateAbstractImage } from './server/image-generation.mjs';
import { PostgresFeedbackStore, normalizeFeedback } from './server/feedback.mjs';
import {
  PostgresVideoGenerationStore,
  VideoGenerationError,
  createMinimaxVideoProvider,
  createVideoGenerationService,
} from './server/video-generation.mjs';
import { resolveTextProvider } from './server/text-provider.mjs';
import {
  buildAssessmentV2,
  calculateJiahaoScore,
  getDailyReactionChallenge,
  jiahaoLevelFor,
  normalizeAssessmentDimensions,
  scoreReactionAnswers,
  upgradeLegacyAssessment,
} from './server/nailoong.mjs';

export { buildAssessmentV2, calculateJiahaoScore, getDailyReactionChallenge, jiahaoLevelFor, normalizeAssessmentDimensions, scoreReactionAnswers, upgradeLegacyAssessment } from './server/nailoong.mjs';
export { signReactionResult, verifyReactionResultToken } from './server/reaction-token.mjs';

const PORT = Number(process.env.PORT || 8080);
const DIST_DIR = fileURLToPath(new URL('./dist', import.meta.url));
const TEXT_PROVIDER = resolveTextProvider(process.env);
const ARK_API_BASE = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');
const ARK_IMAGE_URL = process.env.ARK_IMAGE_URL || 'https://ark.cn-beijing.volces.com/api/plan/v3/images/generations';
const VISION_API_BASE = ARK_API_BASE;
const VISION_MODEL = process.env.ARK_MODEL || 'doubao-seed-2-0-mini-260428';
const VISION_API_KEY = process.env.ARK_API_KEY || process.env.ARK_IMAGE_API_KEY;
const IMAGE_CONFIG = {
  references: {
    nailoong: process.env.NAILOONG_REFERENCE_URL || process.env.IMAGE_REFERENCE_URL || 'https://jiahao.versecraft.cn/assets/nailoong/arms.webp',
    jiahao: [
      process.env.JIAHAO_REFERENCE_URL || 'https://jiahao.versecraft.cn/assets/jiahao/hao-universe-hero.webp',
      process.env.JIAHAO_SECONDARY_REFERENCE_URL || 'https://jiahao.versecraft.cn/assets/jiahao/hao-assay-editorial.webp',
    ],
  },
  volcengine: {
    key: process.env.ARK_IMAGE_API_KEY || VISION_API_KEY || '',
    url: ARK_IMAGE_URL,
    model: process.env.ARK_IMAGE_MODEL || 'doubao-seedream-5.0-lite',
  },
  quality: {
    key: process.env.ARK_IMAGE_API_KEY || VISION_API_KEY || '',
    url: `${VISION_API_BASE}/chat/completions`,
    model: VISION_MODEL,
  },
};
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const MAX_BODY_BYTES = 28 * 1024 * 1024;
const observability = new Observability();
const MINIMAX_VIDEO_BASE = (process.env.MINIMAX_VIDEO_BASE_URL || 'https://api.minimaxi.com').replace(/\/$/, '');
const VIDEO_CONFIG = {
  enabled: process.env.MINIMAX_VIDEO_ENABLED !== 'false',
  key: process.env.MINIMAX_VIDEO_API_KEY || process.env.MINIMAX_API_KEY || '',
  url: process.env.MINIMAX_VIDEO_URL || `${MINIMAX_VIDEO_BASE}/v1/video_generation`,
  queryUrl: process.env.MINIMAX_VIDEO_QUERY_URL || `${MINIMAX_VIDEO_BASE}/v1/query/video_generation`,
  fileUrl: process.env.MINIMAX_VIDEO_FILE_URL || `${MINIMAX_VIDEO_BASE}/v1/files/retrieve`,
  model: process.env.MINIMAX_VIDEO_MODEL || 'MiniMax-Hailuo-2.3',
  async createFirstFrame(request) {
    const frame = await generateAbstractImage(request, IMAGE_CONFIG);
    return frame.imageUrl || frame.imageDataUrl || '';
  },
};
const videoService = createVideoGenerationService({
  store: new PostgresVideoGenerationStore(observability.pool),
  provider: createMinimaxVideoProvider(VIDEO_CONFIG),
  enabled: VIDEO_CONFIG.enabled,
  unavailableMessage: '今日使用人数过多，暂不支持生成',
});
const feedbackStore = new PostgresFeedbackStore(observability.pool);

const DIMENSIONS = ['mystery', 'flex', 'niche', 'deep', 'show', 'language'];
const TYPES = ['自在极意豪', '美式嘉豪', '深情破碎豪', '计算机嘉豪', '股票嘉豪', '不懂装懂豪', '小众优越豪', '潜伏嘉豪', '反向嘉豪', '无意炫耀豪'];

const SYSTEM_PROMPT = `你是“嘉豪鉴定所”的娱乐鉴定官。你的任务是识别网络语境里的嘉豪风格，必须幽默、具体、友善，不评价长相，不侮辱用户，不推断种族、疾病、性别、政治倾向等敏感属性，也不得把结果描述成科学事实。

评论写作规则：像一个很会接梗的朋友当场锐评，不像 AI 写分析报告。必须抓住输入里一个具体细节起梗，用口语写 2 到 3 句，并在结尾落一个轻巧的包袱；可以夸张和比喻，但不要硬塞流行语。禁止使用“综上所述、整体而言、从中可以看出、呈现出、体现了、值得注意、完成闭环、自然流露、建议保持现状”等总结腔，也不要复述分数、物种定义或六个维度。每次根据素材现编，不套用固定开头。

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
  "dimensions": {"mystery":0到100整数,"flex":0到100整数,"niche":0到100整数,"deep":0到100整数,"show":0到100整数,"language":0到100整数},
  "traits": ["四个具体短特征"],
  "evidence": ["三条基于输入内容的具体判定依据"],
  "comment": "50到100字、具体口语化、有包袱的朋友式锐评"
}`;

const PK_SYSTEM_PROMPT = `你是“嘉豪鉴定所”的双人豪气裁决官。你会收到两名选手可能不同类型的素材。请分别按照同一套六维标准完成娱乐分析，再基于表达、构图叙事、信息留白、镜头掌控与豪言风格做综合裁决。胜者不必机械等于总分更高者，但理由必须具体、友善、可解释；实力接近时可以判平局。

评论写作规则：像群聊里最会接梗的朋友，不像 AI 分析报告。每位选手的 comment 都要抓住其素材中的一个具体细节，用 2 到 3 句口语完成“细节—夸张联想—包袱”，两人的句式和开头不得雷同。battle.reason 也要直说胜负手，避免端水套话。禁止使用“综上所述、整体而言、从中可以看出、呈现出、体现了、值得注意、完成闭环、自然流露、建议保持现状”等总结腔。

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

const QUOTE_SYSTEM_PROMPT = `你是“嘉豪语录生成器”的中文文案改写官。这是一个友善的娱乐玩梗工具，不得侮辱、骚扰或煽动伤害任何人，也不要生成仇恨、色情、违法或针对敏感属性的内容。

你有两种任务：
1. hao：把普通话改写成“嘉豪式”表达。特点是克制、欲言又止、看似无所谓、略带戏剧化留白，但不要堆砌网络烂梗。
2. dehao：去掉故作高深、否定式强调和优越感，把原句改成直接、自然、礼貌的普通表达。

豪气等级从弱到强：豪气初现、豪气逼人、豪气冲天、自在极意豪。
风格包括：深情、高冷、小众、无意炫耀、战斗、朋友圈、个性签名、评论区。

只返回一个合法 JSON 对象，不要 Markdown，不要解释。严格结构：
{"output":"改写结果，8到80个中文字符，可以按风格使用换行"}`;

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

function sendJson(res, status, data, cookies = []) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
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
    comment: cleanText(raw.comment, '你嘴上说着随便，细节却一个没迟到，像是临时起意但提前彩排了三遍。别解释，解释就等于给豪气补交书面证明。', 220),
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
    ? {
      id: 'ark', base: VISION_API_BASE, model: VISION_MODEL, key: VISION_API_KEY, source: '云端多模态大模型',
      prices: { input: process.env.ARK_INPUT_CNY_PER_MILLION, output: process.env.ARK_OUTPUT_CNY_PER_MILLION, cachedInput: process.env.ARK_CACHED_INPUT_CNY_PER_MILLION },
    }
    : {
      ...TEXT_PROVIDER,
    };
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
    return { output: extractJson(contentText), usage: data.usage || null };
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
  const modelResponse = await requestModel(provider, SYSTEM_PROMPT, content);
  const signals = normalizeResult(modelResponse.output);
  const dimensions = normalizeAssessmentDimensions(signals.dimensions);
  const score = calculateJiahaoScore(dimensions);
  const ruledResult = { ...signals, dimensions, score, level: jiahaoLevelFor(score), source: `${provider.source} · 规则计分` };
  return { data: buildAssessmentV2(ruledResult, 'signals-rules-v1'), usage: modelResponse.usage, provider };
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
  const modelResponse = await requestModel(provider, PK_SYSTEM_PROMPT, content);
  return {
    data: normalizePkResult(modelResponse.output, participants.map((participant) => participant.name), provider.source === '云端多模态大模型' ? '模型综合裁决 · 多模态' : '模型综合裁决 · 文字'),
    usage: modelResponse.usage,
    provider,
  };
}

async function generateQuoteWithModel(payload) {
  const mode = payload.mode === 'dehao' ? 'dehao' : 'hao';
  const level = ['豪气初现', '豪气逼人', '豪气冲天', '自在极意豪'].includes(payload.level) ? payload.level : '豪气冲天';
  const style = ['深情', '高冷', '小众', '无意炫耀', '战斗', '朋友圈', '个性签名', '评论区'].includes(payload.style) ? payload.style : '高冷';
  const input = cleanText(payload.input, '', 300);
  if (input.length < 2) throw new Error('至少输入两个字');
  const provider = getProvider(false);
  const modelResponse = await requestModel(provider, QUOTE_SYSTEM_PROMPT, `任务：${mode}\n豪气等级：${level}\n风格：${style}\n原句：${input}\n请只返回 JSON。`);
  return {
    data: { output: cleanText(modelResponse.output.output, mode === 'dehao' ? '这件事比较复杂，我暂时不想解释。' : '也没什么，只是有些事情，说了你们也不一定懂。', 160), source: provider.source },
    usage: modelResponse.usage,
    provider,
  };
}

async function handleModelRequest(req, res, endpoint, handler) {
  const started = performance.now();
  const requestId = randomUUID();
  let payload;
  let modelInfo = null;
  try {
    payload = await readJson(req);
    const response = await handler(payload);
    modelInfo = response;
    const cost = calculateEstimatedCost(response.usage, response.provider.prices);
    sendJson(res, 200, response.data);
    void observability.recordApiRequest(req, {
      requestId, endpoint, mode: payload.mode || (endpoint === '/api/pk' ? 'pk' : null), provider: response.provider.id,
      model: response.provider.model, statusCode: 200, ok: true, latencyMs: performance.now() - started, ...cost,
    });
  } catch (error) {
    const message = error?.name === 'AbortError' ? '大模型响应超时' : cleanText(error?.message, '服务暂时不可用', 100);
    const statusCode = message.includes('体积') ? 413 : 503;
    const provider = modelInfo?.provider || getProvider(payload?.mode === 'photo' || payload?.mode === 'chat');
    void observability.recordApiRequest(req, {
      requestId, endpoint, mode: payload?.mode || (endpoint === '/api/pk' ? 'pk' : null), provider: provider.id,
      model: provider.model, statusCode, ok: false, latencyMs: performance.now() - started,
      errorCode: error?.name === 'AbortError' ? 'TIMEOUT' : 'MODEL_REQUEST_FAILED', errorMessage: message,
    });
    return sendJson(res, statusCode, { error: message });
  }
}

async function handleImageRequest(req, res) {
  const started = performance.now();
  const requestId = randomUUID();
  try {
    const result = await generateAbstractImage(await readJson(req), IMAGE_CONFIG);
    sendJson(res, 200, result);
    void observability.recordApiRequest(req, {
      requestId, endpoint: '/api/images/generate', mode: 'image_generation', provider: result.provider,
      model: result.model, statusCode: 200, ok: true, latencyMs: performance.now() - started,
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 503;
    const message = cleanText(error?.message, '图片生成暂时不可用', 100);
    void observability.recordApiRequest(req, {
      requestId, endpoint: '/api/images/generate', mode: 'image_generation', provider: error?.provider || 'image-router',
      model: null, statusCode, ok: false, latencyMs: performance.now() - started,
      errorCode: error?.code || 'IMAGE_GENERATION_FAILED', errorMessage: message,
    });
    return sendJson(res, statusCode, { error: message, code: error?.code || 'IMAGE_GENERATION_FAILED' });
  }
}

async function handleVideoRequest(req, res, action) {
  const started = performance.now();
  const requestId = randomUUID();
  let visitor = null;
  try {
    visitor = await observability.ensureVisitor(req);
    const result = await action(visitor.visitorId);
    const statusCode = result.statusCode || 200;
    sendJson(res, statusCode, result.body, visitor.cookies);
    void observability.recordApiRequest(req, {
      requestId, endpoint: result.endpoint, mode: 'video_generation', provider: 'minimax',
      model: VIDEO_CONFIG.model, statusCode, ok: true, latencyMs: performance.now() - started,
    });
  } catch (error) {
    const known = error instanceof VideoGenerationError || error?.code === 'VIDEO_DATABASE_NOT_CONFIGURED';
    const statusCode = Number(error?.statusCode) || 503;
    const code = known ? error.code : 'VIDEO_SERVICE_FAILED';
    const message = known ? cleanText(error.message, '视频生成暂时不可用', 100) : '视频生成暂时不可用';
    void observability.recordApiRequest(req, {
      requestId, endpoint: '/api/videos', mode: 'video_generation', provider: 'minimax',
      model: VIDEO_CONFIG.model, statusCode, ok: false, latencyMs: performance.now() - started,
      errorCode: code, errorMessage: message,
    });
    return sendJson(res, statusCode, {
      error: message,
      code,
      ...(error?.activeTaskId ? { activeTaskId: error.activeTaskId } : {}),
    }, visitor?.cookies || []);
  }
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

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname === '/healthz') return sendJson(res, 200, {
      status: 'ok',
      textModelConfigured: Boolean(TEXT_PROVIDER.key),
      visionModelConfigured: Boolean(VISION_API_KEY),
      textModel: TEXT_PROVIDER.model,
      visionModel: VISION_MODEL,
      imageGeneration: {
        configured: Boolean(IMAGE_CONFIG.volcengine.key),
        provider: 'volcengine',
        model: IMAGE_CONFIG.volcengine.model,
        characters: {
          nailoong: Boolean(IMAGE_CONFIG.references.nailoong),
          jiahao: Boolean(IMAGE_CONFIG.references.jiahao),
        },
      },
      videoGeneration: {
        configured: Boolean(VIDEO_CONFIG.key) && VIDEO_CONFIG.enabled,
        databaseConfigured: observability.enabled,
        provider: 'minimax',
        model: VIDEO_CONFIG.model,
        dailyLimit: 1,
        ...(VIDEO_CONFIG.enabled ? {} : { unavailableReason: 'provider_unavailable' }),
      },
      feedback: { configured: observability.enabled },
      observability: observability.status(),
    });

    if (req.method === 'POST' && pathname === '/api/telemetry/session') {
      const payload = await readJson(req);
      const result = await observability.recordSession(req, payload);
      return sendJson(res, 200, { tracked: !result.ignored }, result.cookies || []);
    }
    if (req.method === 'POST' && pathname === '/api/telemetry/heartbeat') {
      await observability.heartbeat(req);
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (req.method === 'POST' && pathname === '/api/telemetry/event') {
      const result = await observability.recordProductEvent(req, await readJson(req));
      return sendJson(res, result.accepted ? 202 : 400, result.accepted ? { accepted: true } : { error: '未知增长事件' });
    }

    if (req.method === 'POST' && pathname === '/api/admin/login') {
      const result = await loginAdmin(req, observability, ADMIN_PASSWORD);
      return sendJson(res, result.status, result.body, result.cookies || []);
    }
    if (req.method === 'POST' && pathname === '/api/admin/logout') {
      const result = await logoutAdmin(req, observability);
      return sendJson(res, result.status, result.body, result.cookies || []);
    }
    if (pathname === '/api/admin/session' && req.method === 'GET') {
      return sendJson(res, 200, { authenticated: await verifyAdmin(req, observability), configured: observability.enabled && Boolean(ADMIN_PASSWORD) });
    }
    if (pathname.startsWith('/api/admin/')) {
      if (!(await verifyAdmin(req, observability))) return sendJson(res, 401, { error: '登录已失效，请重新验证' });
      const range = url.searchParams.get('range') || '7d';
      if (req.method === 'GET' && pathname === '/api/admin/overview') return sendJson(res, 200, await observability.overview(range));
      if (req.method === 'GET' && pathname === '/api/admin/visits') return sendJson(res, 200, await observability.visits(range, url.searchParams.get('cursor'), url.searchParams.get('limit')));
      if (req.method === 'GET' && pathname === '/api/admin/requests') return sendJson(res, 200, await observability.requests(range, url.searchParams.get('cursor'), {
        endpoint: url.searchParams.get('endpoint'), status: url.searchParams.get('status'), limit: url.searchParams.get('limit'),
      }));
      if (req.method === 'GET' && pathname === '/api/admin/costs') return sendJson(res, 200, await observability.costs(range));
      if (req.method === 'GET' && pathname === '/api/admin/status') return sendJson(res, 200, observability.status({
        textModelConfigured: Boolean(TEXT_PROVIDER.key), visionModelConfigured: Boolean(VISION_API_KEY),
        adminPasswordConfigured: Boolean(ADMIN_PASSWORD), textModel: TEXT_PROVIDER.model, visionModel: VISION_MODEL,
      }));
      return sendJson(res, 404, { error: '后台接口不存在' });
    }

    if (req.method === 'GET' && pathname === '/api/reactions/daily') {
      return sendJson(res, 200, getDailyReactionChallenge(url.searchParams.get('date'), url.searchParams.get('run')));
    }
    if (req.method === 'POST' && pathname === '/api/reactions/score') {
      const payload = await readJson(req);
      return sendJson(res, 200, scoreReactionAnswers(payload.challengeId, payload.answers, payload.date));
    }

    if (req.method === 'POST' && pathname === '/api/analyze') return handleModelRequest(req, res, pathname, analyzeWithModel);
    if (req.method === 'POST' && pathname === '/api/pk') return handleModelRequest(req, res, pathname, analyzePkWithModel);
    if (req.method === 'POST' && pathname === '/api/court') return handleModelRequest(req, res, pathname, analyzePkWithModel);
    if (req.method === 'POST' && pathname === '/api/quote') return handleModelRequest(req, res, pathname, generateQuoteWithModel);
    if (req.method === 'POST' && pathname === '/api/images/generate') return handleImageRequest(req, res);
    if (req.method === 'POST' && pathname === '/api/feedback') {
      if (!observability.enabled) return sendJson(res, 503, { error: '意见反馈服务尚未配置', code: 'FEEDBACK_DATABASE_NOT_CONFIGURED' });
      const visitor = await observability.ensureVisitor(req);
      const feedback = normalizeFeedback(await readJson(req));
      const feedbackId = await feedbackStore.create(visitor.visitorId, feedback);
      return sendJson(res, 201, { accepted: true, id: feedbackId }, visitor.cookies);
    }
    if (req.method === 'GET' && pathname === '/api/videos/quota') {
      return handleVideoRequest(req, res, async (visitorId) => ({
        endpoint: '/api/videos/quota',
        body: await videoService.quota(visitorId),
      }));
    }
    if (req.method === 'POST' && pathname === '/api/videos/tasks') {
      return handleVideoRequest(req, res, async (visitorId) => ({
        endpoint: '/api/videos/tasks', statusCode: 202,
        body: await videoService.create(visitorId, await readJson(req)),
      }));
    }
    const videoTaskMatch = pathname.match(/^\/api\/videos\/tasks\/([0-9a-f-]{36})$/i);
    if (req.method === 'GET' && videoTaskMatch) {
      return handleVideoRequest(req, res, async (visitorId) => ({
        endpoint: '/api/videos/tasks/:id',
        body: await videoService.status(videoTaskMatch[1], visitorId),
      }));
    }
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res);
    return sendJson(res, 405, { error: '不支持的请求方式' });
  } catch (error) {
    const message = error?.name === 'AbortError' ? '大模型响应超时' : cleanText(error?.message, '服务暂时不可用', 100);
    const statusCode = Number(error?.statusCode) || (message.includes('体积') ? 413 : 503);
    return sendJson(res, statusCode, { error: message, ...(error?.code ? { code: error.code } : {}) });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await observability.init();
    void observability.maintain();
    setInterval(() => void observability.maintain(), 60 * 60 * 1000).unref();
  } catch (error) {
    console.error(`观测数据库初始化失败：${cleanText(error?.message, '未知错误', 120)}`);
  }
  server.listen(PORT, '::', () => {
    console.log(`嘉豪鉴定服务已启动：${PORT}`);
  });
}
