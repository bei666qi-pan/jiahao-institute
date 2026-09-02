const DIMENSION_KEYS = [
  'hardMouth',
  'deadpan',
  'hungerResilience',
  'abstractReaction',
  'cameraSense',
  'friendPrank',
];

const SCORE_WEIGHTS = {
  hardMouth: 0.20,
  deadpan: 0.18,
  hungerResilience: 0.14,
  abstractReaction: 0.22,
  cameraSense: 0.12,
  friendPrank: 0.14,
};

const JIAHAO_SCORE_WEIGHTS = {
  mystery: 0.18,
  flex: 0.16,
  niche: 0.16,
  deep: 0.15,
  show: 0.17,
  language: 0.18,
};

const REACTION_VERSION = 1;

const REACTION_BANK = [
  {
    id: 'late-five-minutes',
    asset: 'umbrella',
    prompt: '朋友说：我五分钟到',
    options: [
      { id: 'trust-once', label: '信他一次', weights: { deadpan: 82, hardMouth: 48, hungerResilience: 58, abstractReaction: 54, cameraSense: 38, friendPrank: 22 } },
      { id: 'order-takeout', label: '先点外卖', weights: { deadpan: 68, hardMouth: 62, hungerResilience: 96, abstractReaction: 78, cameraSense: 42, friendPrank: 55 } },
    ],
  },
  {
    id: 'toe-counting',
    asset: 'toes',
    prompt: '数到第五根脚趾时，突然忘了前面数到哪',
    options: [
      { id: 'restart', label: '从头再来', weights: { deadpan: 86, hardMouth: 40, hungerResilience: 62, abstractReaction: 74, cameraSense: 48, friendPrank: 30 } },
      { id: 'declare-six', label: '宣布一共有六根', weights: { deadpan: 72, hardMouth: 78, hungerResilience: 52, abstractReaction: 94, cameraSense: 60, friendPrank: 76 } },
    ],
  },
  {
    id: 'group-silence',
    asset: 'arms',
    prompt: '你在群里发完长消息，十分钟没人回复',
    options: [
      { id: 'all-busy', label: '大家应该都在忙', weights: { deadpan: 92, hardMouth: 72, hungerResilience: 64, abstractReaction: 48, cameraSense: 38, friendPrank: 20 } },
      { id: 'send-question', label: '再发一个问号', weights: { deadpan: 40, hardMouth: 82, hungerResilience: 46, abstractReaction: 72, cameraSense: 64, friendPrank: 84 } },
    ],
  },
  {
    id: 'photo-tag',
    asset: 'cat',
    prompt: '朋友发了你的丑照并说“本人授权”',
    options: [
      { id: 'save-original', label: '先保存原图', weights: { deadpan: 76, hardMouth: 58, hungerResilience: 66, abstractReaction: 82, cameraSense: 80, friendPrank: 74 } },
      { id: 'return-photo', label: '礼貌回敬九张', weights: { deadpan: 52, hardMouth: 88, hungerResilience: 60, abstractReaction: 86, cameraSense: 72, friendPrank: 98 } },
    ],
  },
  {
    id: 'rain-emo',
    asset: 'umbrella',
    prompt: '下雨了，耳机刚好播到伤感前奏',
    options: [
      { id: 'walk-slower', label: '走慢一点', weights: { deadpan: 70, hardMouth: 64, hungerResilience: 50, abstractReaction: 58, cameraSense: 94, friendPrank: 26 } },
      { id: 'skip-song', label: '切到好运来', weights: { deadpan: 88, hardMouth: 44, hungerResilience: 78, abstractReaction: 92, cameraSense: 62, friendPrank: 64 } },
    ],
  },
  {
    id: 'food-last-bite',
    asset: 'arms',
    prompt: '桌上只剩最后一口，你说自己不饿',
    options: [
      { id: 'wait-three', label: '等三秒再夹', weights: { deadpan: 64, hardMouth: 88, hungerResilience: 92, abstractReaction: 62, cameraSense: 46, friendPrank: 50 } },
      { id: 'offer-friend', label: '夹给朋友再后悔', weights: { deadpan: 82, hardMouth: 58, hungerResilience: 76, abstractReaction: 72, cameraSense: 42, friendPrank: 70 } },
    ],
  },
  {
    id: 'meeting-camera',
    asset: 'toes',
    prompt: '视频会议突然点名让你开摄像头',
    options: [
      { id: 'network-bad', label: '今天网络不太好', weights: { deadpan: 74, hardMouth: 86, hungerResilience: 58, abstractReaction: 70, cameraSense: 36, friendPrank: 42 } },
      { id: 'open-ceiling', label: '打开并对准天花板', weights: { deadpan: 90, hardMouth: 68, hungerResilience: 64, abstractReaction: 96, cameraSense: 88, friendPrank: 78 } },
    ],
  },
  {
    id: 'wrong-message',
    asset: 'cat',
    prompt: '吐槽老板的消息发进了工作群',
    options: [
      { id: 'training', label: '说这是反诈演练', weights: { deadpan: 66, hardMouth: 94, hungerResilience: 72, abstractReaction: 98, cameraSense: 56, friendPrank: 82 } },
      { id: 'recall-offline', label: '撤回并立刻下线', weights: { deadpan: 80, hardMouth: 60, hungerResilience: 68, abstractReaction: 58, cameraSense: 38, friendPrank: 32 } },
    ],
  },
];

function clamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function average(...values) {
  return clamp(values.reduce((sum, value) => sum + clamp(value), 0) / values.length);
}

function weightedScore(dimensions) {
  return clamp(DIMENSION_KEYS.reduce((total, key) => total + clamp(dimensions[key]) * SCORE_WEIGHTS[key], 0));
}

export function calculateJiahaoScore(dimensions = {}) {
  const normalized = normalizeAssessmentDimensions(dimensions);
  return clamp(Object.entries(JIAHAO_SCORE_WEIGHTS).reduce((total, [key, weight]) => total + clamp(normalized[key]) * weight, 0));
}

export function normalizeAssessmentDimensions(dimensions = {}) {
  const keys = Object.keys(JIAHAO_SCORE_WEIGHTS);
  const values = keys.map((key) => Number(dimensions?.[key])).filter(Number.isFinite);
  const scale = values.length && Math.max(...values) > 0 && Math.max(...values) <= 10 ? 10 : 1;
  return Object.fromEntries(keys.map((key) => [key, clamp(Number(dimensions?.[key]) * scale)]));
}

export function jiahaoLevelFor(scoreValue) {
  const score = clamp(scoreValue);
  if (score >= 95) return '自在极意豪';
  if (score >= 80) return '豪气冲天';
  if (score >= 60) return '高阶嘉豪';
  if (score >= 40) return '半步嘉豪';
  if (score >= 20) return '嘉豪观察对象';
  return '清澈普通人';
}

function archetypeFor(dimensions) {
  let strongest = DIMENSION_KEYS[0];
  for (const key of DIMENSION_KEYS.slice(1)) {
    if (clamp(dimensions[key]) > clamp(dimensions[strongest])) strongest = key;
  }
  return {
    hardMouth: '嘴硬型奶龙豪',
    deadpan: '淡人型奶龙豪',
    hungerResilience: '先点外卖型奶龙豪',
    abstractReaction: '抽象反应型奶龙豪',
    cameraSense: '镜头待机型奶龙豪',
    friendPrank: '好友迫害型奶龙豪',
  }[strongest];
}

function levelFor(score) {
  if (score >= 80) return '奶龙显形';
  if (score >= 60) return '奶气在线';
  if (score >= 40) return '奶龙观察对象';
  return '暂未奶化';
}

function verdictFor(archetype) {
  return {
    嘴硬型奶龙豪: '表面说没事，心里已经准备了三套解释。',
    淡人型奶龙豪: '表面说都行，心里已经把一切看淡。',
    先点外卖型奶龙豪: '世界可以迟到，但外卖最好准时。',
    抽象反应型奶龙豪: '正常答案路过了，你选择从旁边绕行。',
    镜头待机型奶龙豪: '嘴上说别拍，站位却从来没有输过。',
    好友迫害型奶龙豪: '朋友的黑历史，在你这里都有高清备份。',
  }[archetype];
}

export function deriveNailoongDimensions(dimensions = {}) {
  return {
    hardMouth: clamp(dimensions.language),
    deadpan: average(dimensions.mystery, dimensions.deep),
    hungerResilience: average(dimensions.deep, dimensions.flex),
    abstractReaction: average(dimensions.niche, dimensions.language),
    cameraSense: clamp(dimensions.show),
    friendPrank: average(dimensions.show, dimensions.flex),
  };
}

export function makeNailoongProfile(dimensions, source = 'rules-v1') {
  const normalized = Object.fromEntries(DIMENSION_KEYS.map((key) => [key, clamp(dimensions?.[key])]));
  const score = weightedScore(normalized);
  const archetype = archetypeFor(normalized);
  return { score, level: levelFor(score), archetype, dimensions: normalized, verdict: verdictFor(archetype), source };
}

export function buildAssessmentV2(result, source = 'rules-v1') {
  if (result?.schemaVersion === 2 && result?.jiahao && result?.nailoong) return structuredClone(result);
  const dimensions = result?.dimensions || {};
  return {
    ...structuredClone(result || {}),
    schemaVersion: 2,
    jiahao: {
      score: clamp(result?.score),
      level: result?.level || '嘉豪观察对象',
      type: result?.type || '潜伏嘉豪',
      dimensions: structuredClone(dimensions),
    },
    nailoong: makeNailoongProfile(deriveNailoongDimensions(dimensions), source),
  };
}

export function upgradeLegacyAssessment(result) {
  return buildAssessmentV2(result, 'legacy-derived');
}

function dateSeed(date) {
  let seed = 2166136261;
  for (const char of date) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function normalizedDate(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function dailyQuestions(date) {
  const start = dateSeed(date) % REACTION_BANK.length;
  return Array.from({ length: 5 }, (_, index) => REACTION_BANK[(start + index * 3) % REACTION_BANK.length]);
}

export function getDailyReactionChallenge(dateValue) {
  const date = normalizedDate(dateValue);
  return {
    challengeId: `reaction-v${REACTION_VERSION}-${date}`,
    date,
    version: REACTION_VERSION,
    questions: dailyQuestions(date).map((question) => ({
      id: question.id,
      asset: question.asset,
      prompt: question.prompt,
      options: question.options.map(({ id, label }) => ({ id, label })),
    })),
  };
}

export function scoreReactionAnswers(challengeId, answers, dateValue) {
  const daily = getDailyReactionChallenge(dateValue);
  if (challengeId !== daily.challengeId || !Array.isArray(answers) || answers.length !== daily.questions.length) {
    throw new Error('反应局答案无效');
  }
  const privateQuestions = new Map(dailyQuestions(daily.date).map((question) => [question.id, question]));
  const seen = new Set();
  const totals = Object.fromEntries(DIMENSION_KEYS.map((key) => [key, 0]));
  for (const answer of answers) {
    const question = privateQuestions.get(answer?.questionId);
    const option = question?.options.find((candidate) => candidate.id === answer?.optionId);
    if (!question || !option || seen.has(question.id)) throw new Error('反应局答案无效');
    seen.add(question.id);
    for (const key of DIMENSION_KEYS) totals[key] += clamp(option.weights[key]);
  }
  const dimensions = Object.fromEntries(DIMENSION_KEYS.map((key) => [key, clamp(totals[key] / answers.length)]));
  return {
    kind: 'reaction',
    challengeId: daily.challengeId,
    date: daily.date,
    answerCount: answers.length,
    nailoong: makeNailoongProfile(dimensions, 'reaction-rules-v1'),
  };
}
