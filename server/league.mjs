import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveTextProvider } from './text-provider.mjs';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const PROMPT_TEXTS = [
  ['jiahao', '群里突然冷场，你用一句话把气氛说得更豪。'],
  ['nailoong', '外卖还有五分钟到，你怎么证明自己一点都不饿？'],
  ['jiahao', '朋友问你为什么戴着耳机不说话，你怎么回？'],
  ['nailoong', '大家都在拍照，你如何表现得完全不在意镜头？'],
  ['jiahao', '你迟到了半小时，用一句话让这件事听起来很有安排。'],
  ['nailoong', '朋友拿出你的黑历史，你的第一反应是什么？'],
  ['jiahao', '别人夸你今天穿得帅，你怎么显得这只是随手一穿？'],
  ['nailoong', '电梯门打开发现走错楼层，你准备怎么演？'],
  ['jiahao', '请用一句话宣布你并没有想成为群里的焦点。'],
  ['nailoong', '朋友说“你不会真生气了吧”，你会怎么回？'],
  ['jiahao', '有人质疑你根本不懂，你用一句话结束对话。'],
  ['nailoong', '视频通话突然开了前置摄像头，你的补救台词是？'],
  ['jiahao', '今天的事情办砸了，如何用一句话说成战略调整？'],
  ['nailoong', '朋友说要减肥却点了奶茶，你如何淡定地表示支持？'],
  ['jiahao', '发了一条朋友圈没人点赞，你会如何解释？'],
  ['nailoong', '聚会时突然被点名表演，你的第一句话是？'],
  ['jiahao', '如果今天只能用一句话保持神秘感，你会说什么？'],
  ['nailoong', '你被发现偷吃最后一块零食，怎么反客为主？'],
  ['jiahao', '老板问进度怎么样了，请给出最有豪气的答案。'],
  ['nailoong', '群里所有人都不回你，你准备用哪句话挽尊？'],
  ['jiahao', '别人问你最近过得怎么样，你如何留下最多空白？'],
  ['nailoong', '玩游戏连输三把，你怎么证明这都在计划中？'],
  ['jiahao', '你想给一个普通的下班瞬间配一句电影台词。'],
  ['nailoong', '大家都同意一件事，你怎么给出一个最抽象的反对理由？'],
  ['jiahao', '请用一句话把“我忘了”说得像主动舍弃。'],
  ['nailoong', '你的黑历史照片成了群头像，怎么回复最合适？'],
  ['jiahao', '朋友说你今天很装，你怎么用一句话完成反向证明？'],
  ['nailoong', '第一次见面就记错了对方名字，你会如何补救？'],
];

export const LEAGUE_PROMPTS = Object.freeze(PROMPT_TEXTS.map(([character, text], index) => Object.freeze({
  id: `league-prompt-${String(index + 1).padStart(2, '0')}`,
  character,
  text,
})));

export function shanghaiDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('日期无效');
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

function dayNumber(date) {
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / DAY_MS);
}

export function getLeaguePrompt(value = new Date()) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : shanghaiDate(value);
  const prompt = LEAGUE_PROMPTS[((dayNumber(date) % LEAGUE_PROMPTS.length) + LEAGUE_PROMPTS.length) % LEAGUE_PROMPTS.length];
  return { ...prompt, date };
}

export function buildSeasonWindow(startDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) throw new Error('赛季开始日无效');
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const endDate = new Date(start + 6 * DAY_MS).toISOString().slice(0, 10);
  const deleteDate = new Date(start + 14 * DAY_MS).toISOString().slice(0, 10);
  return { startDate, endDate, rawContentDeleteAfter: `${deleteDate}T00:00:00.000+08:00` };
}

export function addLeagueScores(aiScore, voteCount) {
  const score = Math.max(0, Math.min(100, Math.round(Number(aiScore) || 0)));
  const votes = Math.max(0, Math.floor(Number(voteCount) || 0));
  return score + Math.min(10, votes * 2);
}

export function rankLeagueRound(entries = []) {
  const maxVotes = entries.reduce((maximum, entry) => Math.max(maximum, Math.max(0, Number(entry.voteCount) || 0)), 0);
  const sorted = entries.map((entry) => ({
    ...entry,
    aiScore: Math.max(0, Math.min(100, Math.round(Number(entry.aiScore) || 0))),
    voteCount: Math.max(0, Math.floor(Number(entry.voteCount) || 0)),
    totalScore: addLeagueScores(entry.aiScore, entry.voteCount),
  })).sort((left, right) => right.totalScore - left.totalScore || right.aiScore - left.aiScore);
  let previousScore = null;
  let previousRank = 0;
  return sorted.map((entry, index) => {
    const rank = entry.totalScore === previousScore ? previousRank : index + 1;
    previousScore = entry.totalScore;
    previousRank = rank;
    const placementPoints = rank === 1 ? 5 : rank === 2 ? 3 : rank === 3 ? 2 : 1;
    const popularityBonus = maxVotes > 0 && entry.voteCount === maxVotes ? 1 : 0;
    return { ...entry, rank, popularityBonus, seasonPoints: placementPoints + popularityBonus };
  });
}

export function buildLeagueAwards(standings = [], submissionRows = []) {
  if (!standings.length) return [];
  const stats = new Map();
  for (const row of submissionRows) {
    const memberId = row.memberId ?? row.member_id;
    if (!memberId || row.aiScore === null || row.aiScore === undefined) continue;
    const current = stats.get(memberId) || { nickname: row.nickname || '', scores: [], votes: 0 };
    current.scores.push(Number(row.aiScore ?? row.ai_score) || 0);
    current.votes += Math.max(0, Number(row.voteCount ?? row.vote_count) || 0);
    stats.set(memberId, current);
  }
  const normalized = [...stats.entries()].map(([memberId, value]) => ({
    memberId,
    nickname: value.nickname || standings.find((item) => item.memberId === memberId)?.nickname || '',
    averageAi: value.scores.reduce((sum, score) => sum + score, 0) / value.scores.length,
    votes: value.votes,
  }));
  const topPoints = Math.max(...standings.map((item) => Number(item.seasonPoints) || 0));
  const topAi = normalized.length ? Math.max(...normalized.map((item) => item.averageAi)) : null;
  const topVotes = normalized.length ? Math.max(...normalized.map((item) => item.votes)) : 0;
  return [
    { key: 'champion', title: '群冠军', names: standings.filter((item) => Number(item.seasonPoints) === topPoints).map((item) => item.nickname) },
    { key: 'hardest', title: '最佳嘴硬', names: topAi === null ? [] : normalized.filter((item) => item.averageAi === topAi).map((item) => item.nickname) },
    { key: 'popular', title: '最受欢迎', names: topVotes > 0 ? normalized.filter((item) => item.votes === topVotes).map((item) => item.nickname) : [] },
  ];
}

const CONTACT_PATTERN = /(?:wxid[_-]?[a-z0-9]{6,}|(?:微信|微信号|qq|q号|手机号|电话)\s*[:：]?\s*[a-z0-9_-]{5,}|1[3-9]\d{9})/i;
const HIGH_RISK_PATTERN = /(?:杀了你|弄死你|死全家|去死|自杀|约炮|强奸)/i;

export function normalizeLeagueAnswer(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const answer = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ');
  if (answer.length < 2) throw Object.assign(new Error('至少 2 个字'), { statusCode: 400, code: 'LEAGUE_ANSWER_TOO_SHORT' });
  if (answer.length > 120) throw Object.assign(new Error('答案不能超过 120 个字'), { statusCode: 400, code: 'LEAGUE_ANSWER_TOO_LONG' });
  if (CONTACT_PATTERN.test(answer)) throw Object.assign(new Error('请删除个人联系方式后再提交'), { statusCode: 400, code: 'LEAGUE_CONTACT_BLOCKED' });
  if (HIGH_RISK_PATTERN.test(answer)) throw Object.assign(new Error('这段内容不适合公开到好友房'), { statusCode: 400, code: 'LEAGUE_CONTENT_BLOCKED' });
  return answer;
}

export function normalizeLeaguePromptOverride(payload = {}) {
  const date = String(payload.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw Object.assign(new Error('题目日期无效'), { statusCode: 400 });
  }
  const character = String(payload.character || '');
  if (!['jiahao', 'nailoong'].includes(character)) throw Object.assign(new Error('题目角色无效'), { statusCode: 400 });
  const text = String(payload.text || '').trim().replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ');
  if (text.length < 8 || text.length > 200) throw Object.assign(new Error('题目需要 8 到 200 个字'), { statusCode: 400 });
  return { date, character, text, active: payload.active !== false };
}

export function normalizeLeagueJudgement(raw = {}) {
  const scoreValue = Number(raw.score);
  const score = Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, Math.round(scoreValue))) : 0;
  const tag = String(raw.tag || '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 16) || '抽象观察员';
  const verdict = String(raw.verdict || '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 60) || '这一招还在等好友现场鉴定。';
  return { score, tag, verdict, publishable: raw.publishable === true };
}

function normalizeRecoveryCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
}

export function generateRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return raw.match(/.{4}/g).join('-');
}

export function digestRecoveryCode(code, secret) {
  if (!secret) throw new Error('恢复口令密钥未配置');
  return createHmac('sha256', secret).update(normalizeRecoveryCode(code)).digest('hex');
}

export function verifyRecoveryCode(code, digest, secret) {
  if (!digest || !secret) return false;
  const actual = Buffer.from(digestRecoveryCode(code, secret), 'hex');
  let expected;
  try { expected = Buffer.from(String(digest), 'hex'); } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function extractFirstJson(text) {
  const source = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  const start = source.indexOf('{');
  if (start < 0) throw new Error('AI 未返回有效判定');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error('AI 未返回完整判定');
}

const LEAGUE_JUDGE_PROMPT = `你是“豪气宇宙”的好友联赛裁判。只判断玩家对当日抽象情境题的一句话回答，语气要像群里会接梗的朋友，友善、具体、不羞辱。
禁止推断真实人格、身份、疾病、性别、种族或政治倾向；禁止回显联系方式、仇恨、色情、暴力威胁或针对他人的骚扰。如果回答不适合在好友房公开，publishable 必须为 false。
只返回 JSON：{"score":0到100整数,"tag":"2到8字称号","verdict":"12到30字朋友式判词","publishable":true或false}。`;

export function createLeagueJudge(env = process.env, fetchImpl = fetch, providerResolver = null) {
  return async ({ prompt, answer, character }) => {
    const provider = providerResolver ? await providerResolver() : resolveTextProvider(env);
    if (!provider.key) throw Object.assign(new Error('文字大模型尚未配置'), { statusCode: 503, code: 'LEAGUE_JUDGE_NOT_CONFIGURED' });
    const response = await fetchImpl(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: LEAGUE_JUDGE_PROMPT },
          { role: 'user', content: `角色主题：${character === 'nailoong' ? '奶龙' : '嘉豪'}\n今日题目：${String(prompt || '').slice(0, 200)}\n玩家答案：${normalizeLeagueAnswer(answer)}` },
        ],
        thinking: { type: 'disabled' },
        max_tokens: 220,
        temperature: 0.72,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw Object.assign(new Error(`AI 判定失败（${response.status}）`), { statusCode: 503, code: 'LEAGUE_JUDGE_FAILED' });
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw Object.assign(new Error('AI 判定为空'), { statusCode: 503, code: 'LEAGUE_JUDGE_EMPTY' });
    return { data: normalizeLeagueJudgement(extractFirstJson(content)), usage: payload.usage || null, provider };
  };
}
