import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveTextProvider } from './text-provider.mjs';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MODE_ANGLES = Object.freeze({
  '接梗局': ['一本正经', '顺势加码', '反客为主'],
  '挽尊局': ['假装计划', '先发制人', '轻描淡写'],
  '甩锅局': ['归因环境', '抬高格局', '巧换概念'],
  '嘴硬局': ['死不承认', '换个定义', '淡定补刀'],
  '救场局': ['自嘲一下', '给人台阶', '转移焦点'],
  '电影局': ['冷酷旁白', '热血宣言', '文艺留白'],
  '反转局': ['先顺着说', '最后翻面', '反问收尾'],
});

const MODE_TWISTS = Object.freeze({
  '接梗局': '最多 18 个字',
  '挽尊局': '不能出现“我”',
  '甩锅局': '要像一条正式群公告',
  '嘴硬局': '结尾必须是反问',
  '救场局': '先夸一句再转弯',
  '电影局': '读完脑中要有一个镜头',
  '反转局': '前半认真，后半翻车',
});

const PROMPT_TEXTS = [
  ['jiahao', '接梗局', '宿舍群有人发：“今晚谁最后洗澡，谁就是明天的闹钟。”你怎么接？', '让人一眼看懂，并忍不住继续接你的梗。'],
  ['nailoong', '挽尊局', '外卖到了，你却在隔壁楼门口等了十分钟。朋友问你在干吗，怎么回？', '承认现场但别让自己显得尴尬。'],
  ['jiahao', '甩锅局', '项目群里在问：“谁把文件改成了 final_最终_真的最终2？”正是你，怎么回？', '把错误说成一个有逻辑的团队选择。'],
  ['nailoong', '嘴硬局', '连输三把后，队友问：“还打吗？”你只能回一句。', '让大家听出你不服，但不攻击队友。'],
  ['jiahao', '救场局', '聚餐时朋友当着新同事的面叫错了对方名字，群里突然安静。你怎么救？', '给双方一个台阶，让群聊继续下去。'],
  ['nailoong', '电影局', '加班结束，你是最后一个走进电梯的人。给这一幕配句台词。', '让一个普通瞬间有画面，但别写成广告。'],
  ['jiahao', '反转局', '朋友在群里说：“你又开始装了。”你怎么回才能把这句话翻过来？', '前半句让人以为你认了，后半句再反转。'],
  ['nailoong', '接梗局', '班级群有人问：“明天点名，谁帮我答到？”你怎么接？', '不真鼓励逃课，但让这句话有梗。'],
  ['jiahao', '挽尊局', '视频会议突然打开前置摄像头，你的表情被全员看见了。第一句说什么？', '主动定义这个现场，不要急着解释。'],
  ['nailoong', '甩锅局', '朋友出游到了才发现你导航的是另一个同名车站。你怎么回？', '把走错路变成旅程的一部分，不甩给具体的人。'],
  ['jiahao', '嘴硬局', '你半夜偷吃零食被室友抓现行，他问：“不是说不饿吗？”', '保住嘴硬的乐趣，别否认已经发生的事。'],
  ['nailoong', '救场局', '朋友发了条语音，背景里清楚传来家人喊他收衣服。群里安静了，你怎么接？', '化解尴尬，不拿对方的家人开过头玩笑。'],
  ['jiahao', '电影局', '下班遇到暴雨，所有人都有伞，只有你没有。给自己一句出场词。', '把倒霉时刻写出镜头感，一句即止。'],
  ['nailoong', '反转局', '老板在群里说：“这个需求很简单。”你怎么接才又稳又有梗？', '先表示认同，再用一个反转说清真实工作量。'],
  ['jiahao', '接梗局', '有人在群里问：“明天能早起的举手。”十分钟没人回，你怎么接？', '把沉默也变成梗，让大家愿意回复。'],
  ['nailoong', '挽尊局', '你发的朋友圈两小时只有自己点赞，朋友截图问怎么回事。', '用自嘲而不是硬撑化解现场。'],
  ['jiahao', '甩锅局', '组队游戏里你的大招空了，队友齐刷刷发了问号。你回什么？', '不怪队友，把失误改写成战术。'],
  ['nailoong', '嘴硬局', '群截图证明你上周说过“下次我请客”。大家开始艾特你，怎么回？', '别逃单，但要让这次认账有点戏。'],
  ['jiahao', '救场局', 'KTV 里朋友一句唱跑调，全桌人同时低头喝水。你说什么？', '保住对方兴致，也让大家有台阶笑出来。'],
  ['nailoong', '电影局', '深夜便利店只剩最后一根烤肠，你和陌生人同时伸手。配一句台词。', '三十个字内写出决战感，但不真跟人冲突。'],
  ['jiahao', '反转局', '朋友说：“你今天怎么这么安静？”你怎么回？', '先接受对方的观察，最后一拍翻回自己主场。'],
  ['nailoong', '接梗局', '有人在群里发了张工资单，数字全打码，只留一句“还行”。你怎么接？', '接住这份神秘感，不打听真实收入。'],
  ['jiahao', '挽尊局', '合照发到群里，十个人只有你闭着眼。大家问要不要重拍，你怎么回？', '保留这张照片，同时让闭眼变成亮点。'],
  ['nailoong', '甩锅局', '你忘了朋友生日，第二天才在群里看到蛋糕照。第一句说什么？', '先表达在意，再给迟到的祝福一个合理说法。'],
  ['jiahao', '嘴硬局', '外卖员电话问：“你是不是很饿？”你的朋友正开着免提。', '用一句话保住嘴硬，同时让外卖员听得懂。'],
  ['nailoong', '救场局', '朋友在群里发了一句过于认真的长文，大家不知道怎么接。你先回什么？', '先接住对方的情绪，再给其他人参与的空间。'],
  ['jiahao', '电影局', '你错过了末班地铁，站台灯刚好全部熄灭。给这一幕配句台词。', '把狼狈写出结尾镜头感，别只说“好惨”。'],
  ['nailoong', '反转局', '群里问：“这个周末谁自愿组织聚会？”所有人都在潜水，你怎么回？', '先像要接下任务，再用反转拉大家一起行动。'],
];

export const LEAGUE_PROMPTS = Object.freeze(PROMPT_TEXTS.map(([character, mode, text, goal], index) => Object.freeze({
  id: `league-prompt-v2-${String(index + 1).padStart(2, '0')}`,
  character,
  mode,
  text,
  goal,
  twist: MODE_TWISTS[mode],
  angles: Object.freeze([...MODE_ANGLES[mode]]),
})));

export function getLeaguePromptGuidance(promptId, character = 'jiahao') {
  const prompt = LEAGUE_PROMPTS.find((item) => item.id === promptId);
  if (prompt) return { mode: prompt.mode, goal: prompt.goal, twist: prompt.twist, angles: [...prompt.angles] };
  return {
    mode: '今日反应局',
    goal: '写一句你真的会发到群里的回复。',
    twist: '不超过 30 个字，别写成小作文',
    angles: character === 'nailoong' ? ['淡定一点', '可爱反转', '顺势接梗'] : ['一本正经', '留点余地', '最后反转'],
  };
}

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
    { key: 'champion', title: '嘉豪之神', names: standings.filter((item) => Number(item.seasonPoints) === topPoints).map((item) => item.nickname) },
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

const LEAGUE_JUDGE_PROMPT = `你是“豪气宇宙”的好友联赛裁判。只判断玩家对当日群聊情境题的一句话回答，语气要像群里会接梗的朋友，友善、具体、不羞辱。
评分优先级：贴题 40%，梗感和群聊效果 30%，原创 20%，完成本局加码 10%。不因为浮夸、生僻或像 AI 写的大词而加分。
禁止推断真实人格、身份、疾病、性别、种族或政治倾向；禁止回显联系方式、仇恨、色情、暴力威胁或针对他人的骚扰。如果回答不适合在好友房公开，publishable 必须为 false。
只返回 JSON：{"score":0到100整数,"tag":"2到8字称号","verdict":"12到30字朋友式判词","publishable":true或false}。`;

export function createLeagueJudge(env = process.env, fetchImpl = fetch, providerResolver = null) {
  return async ({ prompt, answer, character, mode, goal, twist }) => {
    const provider = providerResolver ? await providerResolver() : resolveTextProvider(env);
    if (!provider.key) throw Object.assign(new Error('文字大模型尚未配置'), { statusCode: 503, code: 'LEAGUE_JUDGE_NOT_CONFIGURED' });
    const response = await fetchImpl(`${provider.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: LEAGUE_JUDGE_PROMPT },
          { role: 'user', content: `角色主题：${character === 'nailoong' ? '奶龙' : '嘉豪'}\n本局玩法：${String(mode || '今日反应局').slice(0, 20)}\n今天怎么豪：${String(goal || '贴题、有梗、像真人群聊').slice(0, 120)}\n本局加码：${String(twist || '无').slice(0, 80)}\n今日题目：${String(prompt || '').slice(0, 200)}\n玩家答案：${normalizeLeagueAnswer(answer)}` },
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
