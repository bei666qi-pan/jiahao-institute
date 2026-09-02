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

const REACTION_VERSION = 2;

const REACTION_BANK = [
  {
    id: 'late-five-minutes',
    asset: 'umbrella',
    prompt: '朋友说：我五分钟到',
    options: [
      { id: 'trust-once', label: '信他一次', tone: '最后的天真', reaction: '奶蛙把伞往旁边挪了半格。', weights: { deadpan: 82, hardMouth: 48, hungerResilience: 58, abstractReaction: 54, cameraSense: 38, friendPrank: 22 } },
      { id: 'order-takeout', label: '先点外卖', tone: '饭比人准时', reaction: '人没到，晚饭先到了。', weights: { deadpan: 68, hardMouth: 62, hungerResilience: 96, abstractReaction: 78, cameraSense: 42, friendPrank: 55 } },
      { id: 'send-location', label: '给他发我的定位：家', tone: '原地撤退', reaction: '这五分钟被你直接取消了。', weights: { deadpan: 76, hardMouth: 84, hungerResilience: 70, abstractReaction: 92, cameraSense: 50, friendPrank: 76 } },
    ],
  },
  {
    id: 'toe-counting',
    asset: 'toes',
    prompt: '数到第五根脚趾时，突然忘了前面数到哪',
    options: [
      { id: 'restart', label: '从头再来', tone: '严谨派', reaction: '奶蛙决定尊重数学。', weights: { deadpan: 86, hardMouth: 40, hungerResilience: 62, abstractReaction: 74, cameraSense: 48, friendPrank: 30 } },
      { id: 'declare-six', label: '宣布一共有六根', tone: '结论先行', reaction: '证据不足，但语气很足。', weights: { deadpan: 72, hardMouth: 78, hungerResilience: 52, abstractReaction: 94, cameraSense: 60, friendPrank: 76 } },
      { id: 'ask-the-foot', label: '问脚自己数到哪了', tone: '跨物种沟通', reaction: '脚没有回答，你却释怀了。', weights: { deadpan: 90, hardMouth: 58, hungerResilience: 66, abstractReaction: 99, cameraSense: 54, friendPrank: 68 } },
    ],
  },
  {
    id: 'group-silence',
    asset: 'ktv',
    prompt: '你在群里发完长消息，十分钟没人回复',
    options: [
      { id: 'all-busy', label: '大家应该都在忙', tone: '自我安抚', reaction: '奶蛙替全群批准了忙碌。', weights: { deadpan: 92, hardMouth: 72, hungerResilience: 64, abstractReaction: 48, cameraSense: 38, friendPrank: 20 } },
      { id: 'send-question', label: '再发一个问号', tone: '主动加压', reaction: '沉默从尴尬升级成了案件。', weights: { deadpan: 40, hardMouth: 82, hungerResilience: 46, abstractReaction: 72, cameraSense: 64, friendPrank: 84 } },
      { id: 'wrong-group', label: '补一句“发错群了”', tone: '强行收尾', reaction: '三百字突然有了新的受害者。', weights: { deadpan: 76, hardMouth: 94, hungerResilience: 58, abstractReaction: 90, cameraSense: 72, friendPrank: 62 } },
    ],
  },
  {
    id: 'photo-tag',
    asset: 'cat',
    prompt: '朋友发了你的丑照并说“本人授权”',
    options: [
      { id: 'save-original', label: '先保存原图', tone: '证据保全', reaction: '你没有生气，你只是在建档。', weights: { deadpan: 76, hardMouth: 58, hungerResilience: 66, abstractReaction: 82, cameraSense: 80, friendPrank: 74 } },
      { id: 'return-photo', label: '礼貌回敬九张', tone: '有来有往', reaction: '友谊在这一刻完成了备份。', weights: { deadpan: 52, hardMouth: 88, hungerResilience: 60, abstractReaction: 86, cameraSense: 72, friendPrank: 98 } },
      { id: 'make-avatar', label: '换成他的群头像', tone: '长期运营', reaction: '一次丑照，获得永久席位。', weights: { deadpan: 70, hardMouth: 76, hungerResilience: 64, abstractReaction: 94, cameraSense: 92, friendPrank: 99 } },
    ],
  },
  {
    id: 'rain-emo',
    asset: 'umbrella',
    prompt: '下雨了，耳机刚好播到伤感前奏',
    options: [
      { id: 'walk-slower', label: '走慢一点', tone: '自动入戏', reaction: '雨没变大，戏已经满了。', weights: { deadpan: 70, hardMouth: 64, hungerResilience: 50, abstractReaction: 58, cameraSense: 94, friendPrank: 26 } },
      { id: 'skip-song', label: '切到好运来', tone: '情绪急刹', reaction: '你的悲伤只活了三秒。', weights: { deadpan: 88, hardMouth: 44, hungerResilience: 78, abstractReaction: 92, cameraSense: 62, friendPrank: 64 } },
      { id: 'open-camera', label: '拍一段假装路过', tone: '随时开机', reaction: '这一场雨终于等到主演。', weights: { deadpan: 64, hardMouth: 72, hungerResilience: 54, abstractReaction: 78, cameraSense: 99, friendPrank: 42 } },
    ],
  },
  {
    id: 'food-last-bite',
    asset: 'snack',
    prompt: '桌上只剩最后一口，你说自己不饿',
    options: [
      { id: 'wait-three', label: '等三秒再夹', tone: '礼貌倒计时', reaction: '三秒一到，不饿正式失效。', weights: { deadpan: 64, hardMouth: 88, hungerResilience: 92, abstractReaction: 62, cameraSense: 46, friendPrank: 50 } },
      { id: 'offer-friend', label: '夹给朋友再后悔', tone: '善良过敏', reaction: '筷子松手了，灵魂没有。', weights: { deadpan: 82, hardMouth: 58, hungerResilience: 76, abstractReaction: 72, cameraSense: 42, friendPrank: 70 } },
      { id: 'split-impossible', label: '提议把它切成六份', tone: '公平得离谱', reaction: '最后一口被你开成了股东会。', weights: { deadpan: 74, hardMouth: 70, hungerResilience: 88, abstractReaction: 98, cameraSense: 52, friendPrank: 80 } },
    ],
  },
  {
    id: 'meeting-camera',
    asset: 'video-call',
    prompt: '视频会议突然点名让你开摄像头',
    options: [
      { id: 'network-bad', label: '今天网络不太好', tone: '经典防守', reaction: '声音清晰，借口更清晰。', weights: { deadpan: 74, hardMouth: 86, hungerResilience: 58, abstractReaction: 70, cameraSense: 36, friendPrank: 42 } },
      { id: 'open-ceiling', label: '打开并对准天花板', tone: '形式上配合', reaction: '摄像头开了，你没有。', weights: { deadpan: 90, hardMouth: 68, hungerResilience: 64, abstractReaction: 96, cameraSense: 88, friendPrank: 78 } },
      { id: 'virtual-potato', label: '套个土豆头像', tone: '换皮出席', reaction: '人没到，淀粉到了。', weights: { deadpan: 76, hardMouth: 80, hungerResilience: 72, abstractReaction: 99, cameraSense: 94, friendPrank: 84 } },
    ],
  },
  {
    id: 'wrong-message',
    asset: 'elevator',
    prompt: '吐槽老板的消息发进了工作群',
    options: [
      { id: 'training', label: '说这是反诈演练', tone: '绝地求生', reaction: '群里没人被骗，除了老板。', weights: { deadpan: 66, hardMouth: 94, hungerResilience: 72, abstractReaction: 98, cameraSense: 56, friendPrank: 82 } },
      { id: 'recall-offline', label: '撤回并立刻下线', tone: '肉身退网', reaction: '消息撤回了，人生没有。', weights: { deadpan: 80, hardMouth: 60, hungerResilience: 68, abstractReaction: 58, cameraSense: 38, friendPrank: 32 } },
      { id: 'add-boss', label: '补一句“尤其是您”', tone: '主动引爆', reaction: '你把事故升级成了态度。', weights: { deadpan: 88, hardMouth: 99, hungerResilience: 62, abstractReaction: 96, cameraSense: 72, friendPrank: 90 } },
    ],
  },
  {
    id: 'elevator-small-talk', asset: 'elevator', prompt: '电梯里只有你和刚吵完架的同事',
    options: [
      { id: 'floor-display', label: '研究楼层数字', tone: '目光避险', reaction: '你第一次如此关心电梯进度。', weights: { deadpan: 94, hardMouth: 54, hungerResilience: 66, abstractReaction: 58, cameraSense: 42, friendPrank: 24 } },
      { id: 'weather-talk', label: '问他今天热不热', tone: '强行日常', reaction: '空气比天气更热。', weights: { deadpan: 62, hardMouth: 74, hungerResilience: 60, abstractReaction: 76, cameraSense: 48, friendPrank: 38 } },
      { id: 'wrong-floor', label: '每层都按一下', tone: '延长赛', reaction: '矛盾没解决，旅程变长了。', weights: { deadpan: 78, hardMouth: 82, hungerResilience: 72, abstractReaction: 97, cameraSense: 56, friendPrank: 92 } },
    ],
  },
  {
    id: 'ktv-mic', asset: 'ktv', prompt: 'KTV 突然把麦递给了你',
    options: [
      { id: 'mouth-lyrics', label: '对口型并坚定点头', tone: '无声主唱', reaction: '一句没唱，台风很满。', weights: { deadpan: 90, hardMouth: 70, hungerResilience: 58, abstractReaction: 94, cameraSense: 92, friendPrank: 60 } },
      { id: 'bathroom', label: '立刻去洗手间', tone: '物理消失', reaction: '前奏还在，你已经不在。', weights: { deadpan: 74, hardMouth: 82, hungerResilience: 54, abstractReaction: 62, cameraSense: 34, friendPrank: 28 } },
      { id: 'birthday-song', label: '不管什么歌都唱生日歌', tone: '统一曲库', reaction: '今晚所有人突然过生日。', weights: { deadpan: 76, hardMouth: 66, hungerResilience: 68, abstractReaction: 99, cameraSense: 84, friendPrank: 96 } },
    ],
  },
  {
    id: 'takeout-missing', asset: 'snack', prompt: '外卖少了一份小菜，但你已经很饿',
    options: [
      { id: 'eat-first', label: '吃完再说', tone: '先保命', reaction: '维权可以等，血糖不行。', weights: { deadpan: 84, hardMouth: 52, hungerResilience: 99, abstractReaction: 64, cameraSense: 32, friendPrank: 20 } },
      { id: 'photo-empty', label: '拍空盒子发给客服', tone: '现场取证', reaction: '不存在的小菜拥有了遗照。', weights: { deadpan: 72, hardMouth: 78, hungerResilience: 80, abstractReaction: 88, cameraSense: 86, friendPrank: 46 } },
      { id: 'name-it', label: '给空气起名叫小菜', tone: '精神加餐', reaction: '没吃到，但已经认识了。', weights: { deadpan: 92, hardMouth: 64, hungerResilience: 90, abstractReaction: 99, cameraSense: 54, friendPrank: 72 } },
    ],
  },
  {
    id: 'friend-story', asset: 'cat', prompt: '朋友发动态说“懂的都懂”',
    options: [
      { id: 'like-only', label: '只点赞，不问', tone: '边界感', reaction: '你尊重了他的悬念。', weights: { deadpan: 94, hardMouth: 58, hungerResilience: 64, abstractReaction: 52, cameraSense: 40, friendPrank: 28 } },
      { id: 'reply-dont', label: '评论“不懂”', tone: '拆台型关心', reaction: '四个字让整条动态失去法力。', weights: { deadpan: 72, hardMouth: 86, hungerResilience: 60, abstractReaction: 84, cameraSense: 68, friendPrank: 94 } },
      { id: 'post-same', label: '也发一条“懂的都懂”', tone: '以豪制豪', reaction: '两条悬念在朋友圈相遇了。', weights: { deadpan: 80, hardMouth: 92, hungerResilience: 62, abstractReaction: 96, cameraSense: 88, friendPrank: 82 } },
    ],
  },
  {
    id: 'alarm-late', asset: 'toes', prompt: '闹钟响了，你发现自己已经迟到',
    options: [
      { id: 'five-more', label: '再睡五分钟缓冲一下', tone: '情绪缓冲', reaction: '迟到从事实变成了氛围。', weights: { deadpan: 92, hardMouth: 62, hungerResilience: 72, abstractReaction: 82, cameraSense: 28, friendPrank: 24 } },
      { id: 'traffic', label: '先发一句“路上有点堵”', tone: '人未动嘴先动', reaction: '床到门口这段确实很堵。', weights: { deadpan: 76, hardMouth: 98, hungerResilience: 60, abstractReaction: 90, cameraSense: 52, friendPrank: 50 } },
      { id: 'remote-day', label: '宣布今天适合居家办公', tone: '重新定义规则', reaction: '你没有迟到，你只是换了地点。', weights: { deadpan: 84, hardMouth: 94, hungerResilience: 68, abstractReaction: 98, cameraSense: 62, friendPrank: 64 } },
    ],
  },
  {
    id: 'photo-countdown', asset: 'arms', prompt: '合照倒计时开始，你还没找到站位',
    options: [
      { id: 'edge-cool', label: '站最边上假装不在意', tone: '边缘主角', reaction: '你离中心最远，气质最近。', weights: { deadpan: 76, hardMouth: 74, hungerResilience: 56, abstractReaction: 66, cameraSense: 96, friendPrank: 38 } },
      { id: 'front-squat', label: '直接蹲到第一排', tone: '抢救镜头', reaction: '站位没有了，你创造了座位。', weights: { deadpan: 64, hardMouth: 82, hungerResilience: 62, abstractReaction: 90, cameraSense: 99, friendPrank: 58 } },
      { id: 'walk-through', label: '倒计时结束时路过', tone: '动态入画', reaction: '别人拍合照，你拍纪录片。', weights: { deadpan: 88, hardMouth: 70, hungerResilience: 68, abstractReaction: 98, cameraSense: 94, friendPrank: 84 } },
    ],
  },
  {
    id: 'overdressed', asset: 'umbrella', prompt: '你盛装到场，发现大家都穿拖鞋',
    options: [
      { id: 'say-passing', label: '说自己只是顺路', tone: '嘴硬保命', reaction: '顺路穿了全套，合理。', weights: { deadpan: 72, hardMouth: 98, hungerResilience: 56, abstractReaction: 74, cameraSense: 90, friendPrank: 34 } },
      { id: 'remove-one', label: '脱掉外套强行融入', tone: '局部降级', reaction: '豪华版只卸载了一个组件。', weights: { deadpan: 80, hardMouth: 76, hungerResilience: 62, abstractReaction: 82, cameraSense: 84, friendPrank: 42 } },
      { id: 'group-photo', label: '催大家先拍合照', tone: '来都来了', reaction: '穿错不可怕，没留证才可怕。', weights: { deadpan: 68, hardMouth: 86, hungerResilience: 60, abstractReaction: 92, cameraSense: 99, friendPrank: 78 } },
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

function normalizedRun(value) {
  const run = Number.parseInt(value, 10);
  return Number.isInteger(run) ? Math.max(0, Math.min(2, run)) : 0;
}

function dailyQuestions(date, runValue = 0) {
  const run = normalizedRun(runValue);
  const shuffled = [...REACTION_BANK];
  let seed = dateSeed(date);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
    const target = seed % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled.slice(run * 5, run * 5 + 5);
}

export function getDailyReactionChallenge(dateValue, runValue = 0) {
  const date = normalizedDate(dateValue);
  const run = normalizedRun(runValue);
  return {
    challengeId: `reaction-v${REACTION_VERSION}-${date}-r${run}`,
    date,
    run,
    version: REACTION_VERSION,
    questions: dailyQuestions(date, run).map((question) => ({
      id: question.id,
      asset: question.asset,
      prompt: question.prompt,
      options: question.options.map(({ id, label, tone, reaction }) => ({ id, label, tone, reaction })),
    })),
  };
}

export function scoreReactionAnswers(challengeId, answers, dateValue) {
  const run = normalizedRun(String(challengeId || '').match(/-r(\d+)$/)?.[1]);
  const daily = getDailyReactionChallenge(dateValue, run);
  if (challengeId !== daily.challengeId || !Array.isArray(answers) || answers.length !== daily.questions.length) {
    throw new Error('反应局答案无效');
  }
  const privateQuestions = new Map(dailyQuestions(daily.date, run).map((question) => [question.id, question]));
  const seen = new Set();
  const totals = Object.fromEntries(DIMENSION_KEYS.map((key) => [key, 0]));
  const moments = [];
  for (const answer of answers) {
    const question = privateQuestions.get(answer?.questionId);
    const option = question?.options.find((candidate) => candidate.id === answer?.optionId);
    if (!question || !option || seen.has(question.id)) throw new Error('反应局答案无效');
    seen.add(question.id);
    for (const key of DIMENSION_KEYS) totals[key] += clamp(option.weights[key]);
    moments.push({ prompt: question.prompt, choice: option.label, tone: option.tone, reaction: option.reaction, asset: question.asset, abstractScore: option.weights.abstractReaction });
  }
  const dimensions = Object.fromEntries(DIMENSION_KEYS.map((key) => [key, clamp(totals[key] / answers.length)]));
  const highlight = moments.reduce((best, moment) => moment.abstractScore > best.abstractScore ? moment : best, moments[0]);
  return {
    kind: 'reaction',
    challengeId: daily.challengeId,
    date: daily.date,
    run,
    answerCount: answers.length,
    highlight: { prompt: highlight.prompt, choice: highlight.choice, tone: highlight.tone, reaction: highlight.reaction, asset: highlight.asset },
    nailoong: makeNailoongProfile(dimensions, 'reaction-rules-v2'),
  };
}
