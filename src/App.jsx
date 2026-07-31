import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { imageFileToDataUrl, prepareFiles, validateFiles } from './fileProcessing';
import { decideFallbackWinner } from './validation';
import './styles.css';

const SITE_URL = 'https://jiahao.versecraft.cn';
const ASSET_BASE_URL = (import.meta.env.VITE_ASSET_BASE_URL || 'https://assets.versecraft.cn/jiahao').replace(/\/$/, '');
const LOCAL_ASSET_BASE_URL = `${import.meta.env.BASE_URL}assets`.replace(/\/$/, '');
const MODEL_FALLBACK_NOTICE = '云端大模型太火爆，暂时用豪之算法进行计算';

const MODES = [
  { id: 'photo', label: '照片鉴定', hint: '上传一张最有感觉的照片' },
  { id: 'chat', label: '聊天记录', hint: '上传图片、PDF、TXT 或 DOCX，记得先隐藏隐私' },
  { id: 'text', label: '文字鉴定', hint: '输入朋友圈文案、签名或你想说的一句话' },
  { id: 'pk', label: '双人PK', hint: '双方选择各自的豪气样本' },
];

const SPECIES = [
  { name: '自在极意豪', en: '极意形态', asset: `${ASSET_BASE_URL}/species-blue-e84f59b60d69.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-blue.png`, crop: '0% center', summary: '豪气自行运转，万物皆可成为舞台。', clue: '黑口罩、苹果耳机、低头侧脸；越不解释越有戏。' },
  { name: '美式嘉豪', en: '潮流形态', asset: `${ASSET_BASE_URL}/species-blue-e84f59b60d69.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-blue.png`, crop: '50% center', summary: '墨镜一戴，自以为很潮的松弛感开始接管画面。', clue: '棒球夹克、冰美式，走两步就像在拍音乐短片。' },
  { name: '深情破碎豪', en: '深夜形态', asset: `${ASSET_BASE_URL}/species-blue-e84f59b60d69.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-blue.png`, crop: '100% center', summary: '嘴上说无所谓，歌单已经循环八遍。', clue: '深夜、侧脸，以及没发出去的长文。' },
  { name: '计算机嘉豪', en: '终端形态', asset: `${ASSET_BASE_URL}/species-labs-0726b69b115d.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-labs.png`, crop: '0% center', summary: '终端常驻，配置单和键盘轴体张口就来。', clue: '不一定在写代码，但一定在讲底层。' },
  { name: '股票嘉豪', en: '行情形态', asset: `${ASSET_BASE_URL}/species-labs-0726b69b115d.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-labs.png`, crop: '50% center', summary: '行情线一开口，宏观叙事自动生成。', clue: '涨了“早就说了”，跌了“长期价值”。' },
  { name: '不懂装懂豪', en: '抽象形态', asset: `${ASSET_BASE_URL}/species-labs-0726b69b115d.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-labs.png`, crop: '100% center', summary: '术语密度拉满，细问就是底层逻辑。', clue: '闭环、赋能、认知差，主打一个语义防御。' },
  { name: '小众优越豪', en: '冷门形态', asset: `${ASSET_BASE_URL}/species-blue-e84f59b60d69.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-blue.png`, crop: '50% center', summary: '不是冷门，只是你们暂时还没听懂。', clue: '越不解释，越等待别人追问。' },
  { name: '潜伏嘉豪', en: '静默形态', asset: `${ASSET_BASE_URL}/species-blue-e84f59b60d69.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-blue.png`, crop: '100% center', summary: '表面风平浪静，细节里全是豪气伏笔。', clue: '一句“随便”里藏着十八层构图。' },
  { name: '反向嘉豪', en: '反向形态', asset: `${ASSET_BASE_URL}/species-blue-e84f59b60d69.png`, posterAsset: `${LOCAL_ASSET_BASE_URL}/jiahao-species-blue.png`, crop: '0% center', summary: '越是否认自己嘉豪，豪气越难以隐藏。', clue: '我真没装——通常是最响的前奏。' },
];

const DIMENSION_META = [
  ['mystery', '神秘感'],
  ['flex', '无意炫耀'],
  ['niche', '小众优越'],
  ['deep', '深情浓度'],
  ['show', '镜头掌控'],
  ['language', '豪言匹配'],
];

const ANALYSIS_STEPS = [
  '正在捕捉潜在豪气……',
  '正在识别无意式炫耀……',
  '正在测量深夜深情浓度……',
  '正在比对嘉豪物种图谱……',
  '豪气正在汇聚……',
];

const EXAMPLES = [
  '也没什么，只是一个人习惯了。',
  '这个框架底层逻辑其实不复杂，我一般直接在终端里跑。',
  '这波回调很正常，我看的是长期价值和仓位管理。',
  '不是不会解释，主要这个涉及认知闭环，你懂的。',
];

const QUOTE_LEVELS = ['豪气初现', '豪气逼人', '豪气冲天', '自在极意豪'];
const QUOTE_STYLES = ['深情', '高冷', '小众', '无意炫耀', '战斗', '朋友圈', '个性签名', '评论区'];
function Icon({ name, size = 20 }) {
  const paths = {
    arrow: <><path d="M4 12h15"/><path d="m14 5 7 7-7 7"/></>,
    text: <><path d="M4 6h16"/><path d="M12 6v14"/><path d="M8 20h8"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
    download: <><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></>,
    reset: <><path d="M4 7v5h5"/><path d="M5.7 16a8 8 0 1 0 .3-9L4 12"/></>,
    close: <><path d="m5 5 14 14M19 5 5 19"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    camera: <><path d="M8 5 9.5 3h5L16 5h3a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z"/><circle cx="12" cy="13" r="4"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/></>,
    sword: <><path d="m14 4 6 6-9 9-6 1 1-6z"/><path d="m13 5 6 6M4 4l16 16"/></>,
    spark: <><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/></>,
    spark: <><path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{paths[name]}</svg>;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function clamp(n, min = 8, max = 99) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function analyze(input, mode, files) {
  const raw = mode === 'text' ? input.trim() : files.map((file) => `${file.name}-${file.size}`).join('|');
  const seed = hashString(`${mode}:${raw || 'jiahao'}`);
  const jitter = (shift) => ((seed >> shift) % 17) - 8;
  const has = (pattern) => pattern.test(raw);
  const base = 54 + (seed % 14);

  const dimensions = {
    mystery: clamp(base + jitter(1) + (has(/黑|夜|口罩|不想|侧脸|冷|无所谓/) ? 18 : 0)),
    flex: clamp(base + jitter(3) + (has(/车|方向盘|价格|只是|刚好|随手|不是故意|落地/) ? 23 : 0)),
    niche: clamp(base + jitter(5) + (has(/小众|冷门|你们不懂|知道的人|地下|主流/) ? 25 : 0)),
    deep: clamp(base + jitter(7) + (has(/一个人|习惯|深夜|无所谓|失望|算了|没事|想你/) ? 26 : 0)),
    show: clamp(base + jitter(9) + (mode !== 'text' ? 20 : 0) + (has(/镜头|拍|看我|照片/) ? 15 : 0)),
    language: clamp(base + jitter(11) + (has(/你记住|反正|懂吧|我也没说|可能你们|别多想|只是|底层逻辑|赋能|闭环/) ? 25 : 0)),
  };

  const weighted = dimensions.mystery * 0.2 + dimensions.flex * 0.2 + dimensions.niche * 0.2 + dimensions.deep * 0.15 + dimensions.show * 0.15 + dimensions.language * 0.1;
  const score = clamp(weighted + (seed % 4), 12, 100);
  const sorted = DIMENSION_META.map(([key, label]) => ({ key, label, value: dimensions[key] })).sort((a, b) => b.value - a.value);

  let level = '嘉豪观察对象';
  let verdict = '你的豪气刚刚苏醒，偶尔会出现一些不经意的嘉豪行为。';
  if (score >= 95) [level, verdict] = ['自在极意豪', '豪气自行运转，万物皆可成为你的舞台。'];
  else if (score >= 80) [level, verdict] = ['豪气冲天', '你的豪气已经突破屏幕，普通镜头很难承载这份豪意。'];
  else if (score >= 60) [level, verdict] = ['高阶嘉豪', '你试图把豪气藏进日常，但每个细节都在替你发言。'];
  else if (score >= 40) [level, verdict] = ['半步嘉豪', '豪气正在加载，偶尔已经能听见引擎声。'];
  else [level, verdict] = ['清澈普通人', '气息过于正常，建议先观察，不要急着修炼。'];

  let type = '潜伏嘉豪';
  if (score >= 95) type = '自在极意豪';
  else if (has(/代码|编程|程序|计算机|电脑|终端|命令行|框架|键盘|配置|服务器|算法|bug/i)) type = '计算机嘉豪';
  else if (has(/股票|基金|K线|仓位|抄底|牛市|熊市|回调|价值投资|大盘|宏观|涨停/)) type = '股票嘉豪';
  else if (has(/底层逻辑|闭环|赋能|认知差|方法论|抓手|对齐|颗粒度|这个你不懂|你懂的/)) type = '不懂装懂豪';
  else if (has(/美式|咖啡|落地|墨镜|夹克|方向盘|公路|潮流|MV/i)) type = '美式嘉豪';
  else if (sorted[0].key === 'deep') type = '深情破碎豪';
  else if (sorted[0].key === 'niche') type = '小众优越豪';
  else if (score < 40) type = '反向嘉豪';
  else if (sorted[0].key === 'flex') type = '无意炫耀豪';

  const evidenceMap = {
    mystery: '信息留白面积很大，给“你们最好主动来问”留下充分空间。',
    flex: '表面像随手一提，关键元素却都稳稳进入了叙事中心。',
    niche: '内容出现“懂的人自然懂”式身份暗号，小众雷达明显波动。',
    deep: '克制表达与情绪余震同时出现，深夜浓度已超过建议值。',
    show: '构图意识强，哪怕没有镜头，语言也会自动寻找最佳机位。',
    language: '经典否定式强调结构被捕获：越说没什么，越像有什么。',
  };

  const traitMap = {
    自在极意豪: ['黑口罩', '苹果耳机', '低头侧脸', '拒绝解释'],
    美式嘉豪: ['墨镜常驻', '自以为很潮', '冰美式', '潮流步态'],
    深情破碎豪: ['深夜在线', '嘴硬心软', '歌单循环', '侧脸叙事'],
    计算机嘉豪: ['终端常驻', '配置敏感', '轴体研究', '底层爱好者'],
    股票嘉豪: ['K 线凝视', '宏观叙事', '仓位管理', '事后先知'],
    不懂装懂豪: ['术语连发', '底层逻辑', '认知闭环', '细问转场'],
    小众优越豪: ['冷门雷达', '懂的都懂', '拒绝主流', '等待追问'],
    潜伏嘉豪: ['表面正常', '细节埋点', '随手构图', '静默蓄力'],
    反向嘉豪: ['持续否认', '越描越豪', '普通伪装', '反向确认'],
    无意炫耀豪: ['随手露出', '否定强调', '构图精准', '等待发现'],
  };

  return {
    id: `嘉豪-${String(seed).slice(0, 8).padStart(8, '0')}`,
    score,
    level,
    verdict,
    type,
    traits: traitMap[type] || ['神秘感', '不经意', '等待追问', '稳定发挥'],
    dimensions,
    top: sorted.slice(0, 3),
    evidence: sorted.slice(0, 3).map((item) => evidenceMap[item.key]),
    comment: `你嘴上说着随便，${sorted[0].label}却第一个冲进镜头，${sorted[1].label}还顺手把门反锁了。至于${sorted[2].label}，它表面没说话，实际上已经替“${type}”签完到。`,
    createdAt: Date.now(),
    mode,
    source: '豪之算法',
  };
}

async function analyzeWithCloud(input, mode, files, prepared) {
  const content = prepared || (mode === 'text' ? { images: [], extractedText: '' } : await prepareFiles(files));
  const images = content.images;
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: input.trim(), mode, images, extractedText: content.extractedText || '' }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '云端大模型暂时不可用');
  }
  const payload = await response.json();
  const dimensions = Object.fromEntries(DIMENSION_META.map(([key]) => [key, clamp(payload.dimensions?.[key], 0, 100)]));
  const top = DIMENSION_META.map(([key, label]) => ({ key, label, value: dimensions[key] })).sort((a, b) => b.value - a.value).slice(0, 3);
  const raw = mode === 'text' ? input.trim() : files.map((file) => `${file.name}-${file.size}`).join('|');
  return {
    ...payload,
    id: `嘉豪-${String(hashString(`${mode}:${raw}`)).slice(0, 8).padStart(8, '0')}`,
    score: clamp(payload.score, 0, 100),
    dimensions,
    top,
    traits: Array.isArray(payload.traits) ? payload.traits.slice(0, 4) : ['豪气在线', '细节埋点', '等待追问', '稳定发挥'],
    evidence: Array.isArray(payload.evidence) ? payload.evidence.slice(0, 3) : [],
    source: payload.source || '云端大模型',
    createdAt: Date.now(),
    mode,
  };
}

function makeFallbackQuote(input, mode, level, style, variation = 0) {
  const source = input.trim().replace(/[。！？!?]+$/, '');
  if (mode === 'dehao') {
    const normalized = source
      .replace(/你们(可能)?(也)?(不一定懂|理解不了)/g, '这件事比较复杂')
      .replace(/我也没说什么[，,]?只是/g, '')
      .replace(/懂的都懂/g, '这里不展开说明')
      .replace(/算了[，,]?你记住就好/g, '暂时先这样');
    const outputs = [
      `${normalized || '这件事比较复杂'}，我暂时不想解释。`,
      `${normalized || '我的意思比较简单'}，没有其他暗示。`,
      `简单来说，${normalized || '我现在不方便详细说明'}。`,
    ];
    return outputs[variation % outputs.length];
  }

  const subject = /不想说|沉默|没话/.test(source) ? '没话说' : /累/.test(source) ? '累' : /难过|伤心/.test(source) ? '难过' : /忙/.test(source) ? '忙' : '这点事';
  const byLevel = {
    豪气初现: `${source}，不过也没什么。`,
    豪气逼人: `${subject === '这点事' ? '事情难不难' : `${subject}不${subject}`}其实无所谓，反正这些事一直都是我自己扛。`,
    豪气冲天: `不是${subject}，只是有些事情，说了你们也不一定懂。`,
    自在极意豪: `${/累/.test(source) ? '身体会累' : '事情会过去'}，但我不会。算了，你记住就好。`,
  };
  const base = byLevel[level] || byLevel['豪气冲天'];
  const styleVariants = {
    深情: variation % 2 ? `我不是放不下${source ? `，只是${source}` : ''}。有些话到了深夜，就不用再说了。` : `${base} 可能沉默久了，连遗憾都显得多余。`,
    高冷: base,
    小众: `${base} 这种感觉本来就不是给所有人理解的。`,
    无意炫耀: `${source}。也不算什么，毕竟这种程度我早就习惯了。`,
    战斗: `${source}可以，但别把它当成我停下来的理由。`,
    朋友圈: `${base}\n\n有些状态，不需要解释。`,
    个性签名: `我不解释，时间自然会替我开口。`,
    评论区: `也没什么好说的，经历过的人自然懂。`,
  };
  return styleVariants[style] || base;
}

async function generateQuoteWithCloud(input, mode, level, style) {
  const response = await fetch('/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: input.trim(), mode, level, style }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '云端语录生成暂时不可用');
  }
  const payload = await response.json();
  if (!payload.output) throw new Error('语录生成结果为空');
  return { output: payload.output, source: payload.source || '云端文字大模型' };
}

function makeFallbackPk(participants) {
  const results = participants.map((participant) => ({
    name: participant.name,
    ...analyze(participant.input || participant.extractedText || '', participant.mode, participant.files || []),
  }));
  const winner = decideFallbackWinner(results[0].score, results[1].score);
  const winningName = winner === 'tie' ? '双方' : results[winner === 'A' ? 0 : 1].name;
  return {
    kind: 'pk',
    participants: results,
    battle: {
      winner,
      title: winner === 'tie' ? '豪气同频' : `${winningName} 胜出`,
      reason: winner === 'tie' ? '双方豪气强度几乎一致，这场对决暂时难分高下。' : `${winningName} 的综合豪气信号更稳定，在六维扫描中占据上风。`,
      decisiveDimensions: results[0].top.slice(0, 2).map((item) => item.label),
      source: '豪之算法',
      fallbackNotice: MODEL_FALLBACK_NOTICE,
    },
    id: `嘉豪-PK-${String(hashString(results.map((item) => item.id).join(':'))).slice(0, 8)}`,
    createdAt: Date.now(),
  };
}

async function analyzePkWithCloud(participants) {
  const response = await fetch('/api/pk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ participants: participants.map(({ name, mode, input, extractedText, images }) => ({ name, mode, input, extractedText, images })) }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || '云端 PK 裁决暂时不可用');
  }
  const payload = await response.json();
  return {
    ...payload,
    kind: 'pk',
    id: payload.id || `嘉豪-PK-${String(hashString(JSON.stringify(payload))).slice(0, 8)}`,
    createdAt: Date.now(),
  };
}

function Radar({ dimensions, compact = false }) {
  const size = compact ? 170 : 250;
  const center = size / 2;
  const radius = size * 0.36;
  const values = DIMENSION_META.map(([key]) => dimensions[key]);
  const point = (index, value = 100) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
    const r = radius * (value / 100);
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  };
  return (
    <svg className="radar" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="六维豪气雷达图">
      {[25, 50, 75, 100].map((tick) => <polygon key={tick} points={values.map((_, i) => point(i, tick)).join(' ')} fill="none" stroke="currentColor" opacity={tick === 100 ? 0.7 : 0.18} />)}
      {values.map((_, i) => <line key={i} x1={center} y1={center} x2={point(i).split(',')[0]} y2={point(i).split(',')[1]} stroke="currentColor" opacity=".25" />)}
      <polygon points={values.map((v, i) => point(i, v)).join(' ')} fill="var(--signal)" fillOpacity=".2" stroke="var(--signal)" strokeWidth="3" />
      {values.map((v, i) => { const [cx, cy] = point(i, v).split(','); return <circle key={i} cx={cx} cy={cy} r="4" fill="var(--paper)" stroke="var(--signal)" strokeWidth="2" />; })}
    </svg>
  );
}

function ModelSourceNotice({ source, fallbackNotice, compact = false }) {
  const isFallback = Boolean(fallbackNotice);
  return (
    <div className={`model-source-notice ${isFallback ? 'is-fallback' : 'is-cloud'} ${compact ? 'is-compact' : ''}`} role="status">
      <Icon name={isFallback ? 'spark' : 'check'} size={18} />
      <div>
        <strong>{isFallback ? fallbackNotice : '云端分析已完成'}</strong>
        <span>{isFallback ? '结果由浏览器内的豪之算法即时生成，未伪装成云端模型输出。' : `本次结果由${source || '云端大模型'}实时生成。`}</span>
      </div>
    </div>
  );
}

function AnimatedNumber({ value }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const duration = 1000;
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      setCurrent(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return current;
}

function useHistory() {
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jiahao-history')) || []; } catch { return []; }
  });
  const add = (result) => {
    const next = [result, ...history].slice(0, 6);
    setHistory(next);
    try { localStorage.setItem('jiahao-history', JSON.stringify(next)); } catch { /* storage may be disabled */ }
  };
  const clear = () => {
    setHistory([]);
    try { localStorage.removeItem('jiahao-history'); } catch { /* storage may be disabled */ }
  };
  return { history, add, clear };
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const chars = [...text];
  const lines = [];
  let line = '';
  chars.forEach((char) => {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = char; } else line = test;
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
}

function loadPosterImage(src, label) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => reject(new Error(`${label}加载超时`)), 12_000);
    const settle = (callback) => {
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      callback();
    };
    image.onload = () => settle(() => resolve(image));
    image.onerror = () => settle(() => reject(new Error(`${label}加载失败`)));
    image.src = src;
  });
}

async function makePoster(result) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070b12';
  ctx.fillRect(0, 0, 1080, 1440);
  ctx.strokeStyle = '#2f7bff';
  ctx.lineWidth = 16;
  ctx.strokeRect(24, 24, 1032, 1392);

  const species = SPECIES.find((item) => item.name === result.type) || SPECIES[0];
  const img = await loadPosterImage(species.posterAsset, '海报配图').catch(() => null);
  if (img?.naturalWidth) {
    const crop = species.crop.startsWith('100') ? 2 : species.crop.startsWith('50') ? 1 : 0;
    const sx = img.naturalWidth / 3 * crop;
    ctx.save();
    ctx.beginPath();
    ctx.rect(612, 150, 380, 580);
    ctx.clip();
    ctx.drawImage(img, sx, 0, img.naturalWidth / 3, img.naturalHeight, 612, 150, 380, 580);
    ctx.restore();
  }

  ctx.fillStyle = '#eaf2ff';
  ctx.font = '900 62px Arial, sans-serif';
  ctx.fillText('嘉豪鉴定所', 78, 120);
  ctx.font = '600 22px monospace';
  ctx.fillText(`鉴定编号 / ${result.id}`, 78, 160);
  ctx.fillStyle = '#2f7bff';
  ctx.font = '900 280px Arial, sans-serif';
  ctx.fillText(String(result.score).padStart(2, '0'), 64, 480);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillText('/ 100  嘉豪指数', 90, 532);
  ctx.fillStyle = '#2f7bff';
  ctx.fillRect(72, 584, 486, 9);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '900 84px Arial, sans-serif';
  drawWrappedText(ctx, result.type, 72, 686, 500, 92, 2);

  ctx.fillStyle = '#eaf2ff';
  ctx.fillRect(72, 770, 936, 4);
  ctx.font = '700 28px Arial, sans-serif';
  ctx.fillText('豪气成分 / 前三项', 72, 826);
  result.top.forEach((item, index) => {
    const y = 880 + index * 72;
    ctx.font = '700 32px Arial, sans-serif';
    ctx.fillText(`0${index + 1}  ${item.label}`, 72, y);
    ctx.fillStyle = '#2f7bff';
    ctx.fillRect(360, y - 25, item.value * 5.4, 24);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '800 28px monospace';
    ctx.fillText(String(item.value), 930, y);
  });

  ctx.fillRect(72, 1090, 936, 4);
  ctx.fillStyle = '#73d7ff';
  ctx.font = '900 34px Arial, sans-serif';
  drawWrappedText(ctx, result.verdict, 72, 1150, 690, 46, 3);
  const qr = await QRCode.toDataURL(SITE_URL, { margin: 0, width: 150, color: { dark: '#eaf2ff', light: '#070b12' } });
  const qrImg = await loadPosterImage(qr, '二维码');
  ctx.drawImage(qrImg, 840, 1130, 150, 150);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '600 20px monospace';
  ctx.fillText('长按扫码，再鉴定一个', 754, 1318);
  ctx.fillText('结果仅供娱乐 · 不上传内容', 72, 1360);
  return canvas.toDataURL('image/png');
}

async function makePkPoster(result) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070b12'; ctx.fillRect(0, 0, 1080, 1440);
  ctx.strokeStyle = '#2f7bff'; ctx.lineWidth = 16; ctx.strokeRect(24, 24, 1032, 1392);
  ctx.fillStyle = '#eaf2ff'; ctx.font = '900 62px Arial, sans-serif'; ctx.fillText('嘉豪鉴定所', 70, 118);
  ctx.font = '600 22px monospace'; ctx.fillText(`双人 PK / ${result.id}`, 70, 160);
  const colors = ['#2f7bff', '#ff7657'];
  result.participants.forEach((participant, index) => {
    const x = index === 0 ? 70 : 570;
    ctx.strokeStyle = colors[index]; ctx.lineWidth = 3; ctx.strokeRect(x, 240, 440, 650);
    ctx.fillStyle = colors[index]; ctx.font = '800 28px Arial, sans-serif'; ctx.fillText(index === 0 ? '选手 A' : '选手 B', x + 30, 292);
    ctx.fillStyle = '#eaf2ff'; ctx.font = '900 48px Arial, sans-serif'; drawWrappedText(ctx, participant.name, x + 30, 360, 380, 54, 1);
    ctx.fillStyle = colors[index]; ctx.font = '900 190px Arial, sans-serif'; ctx.fillText(String(participant.score).padStart(2, '0'), x + 24, 570);
    ctx.fillStyle = '#eaf2ff'; ctx.font = '800 40px Arial, sans-serif'; drawWrappedText(ctx, participant.type, x + 30, 650, 380, 46, 2);
    DIMENSION_META.forEach(([key, label], dimensionIndex) => {
      const y = 740 + dimensionIndex * 22;
      ctx.fillStyle = '#eaf2ff'; ctx.font = '600 15px Arial, sans-serif'; ctx.fillText(label, x + 30, y);
      ctx.fillStyle = colors[index]; ctx.fillRect(x + 125, y - 11, participant.dimensions[key] * 2.45, 10);
    });
  });
  ctx.fillStyle = '#73d7ff'; ctx.font = '900 66px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(result.battle.title, 540, 1010);
  ctx.textAlign = 'left'; ctx.fillStyle = '#eaf2ff'; ctx.font = '700 28px Arial, sans-serif'; drawWrappedText(ctx, result.battle.reason, 170, 1080, 740, 42, 3);
  const qr = await QRCode.toDataURL(SITE_URL, { margin: 0, width: 150, color: { dark: '#eaf2ff', light: '#070b12' } });
  const qrImg = await loadPosterImage(qr, '二维码');
  ctx.drawImage(qrImg, 840, 1210, 150, 150);
  ctx.fillStyle = '#eaf2ff'; ctx.font = '600 20px monospace'; ctx.fillText('模型综合裁决 · 仅供娱乐', 70, 1320); ctx.fillText('海报不包含原始素材', 70, 1360);
  return canvas.toDataURL('image/png');
}

function Header({ page, onNavigate, onAssay, onHistory }) {
  return (
    <header className="site-header">
      <button className="brand" onClick={onAssay} aria-label="返回鉴定首页"><span>嘉豪</span>鉴定所</button>
      <nav aria-label="主导航">
        <button className={page === 'assay' ? 'active' : ''} aria-current={page === 'assay' ? 'page' : undefined} onClick={onAssay}>鉴定</button>
        <button className={page === 'quotes' ? 'active' : ''} aria-current={page === 'quotes' ? 'page' : undefined} onClick={() => onNavigate('quotes')}>语录生成器</button>
        <button onClick={() => { onNavigate('assay'); window.setTimeout(() => document.querySelector('#species')?.scrollIntoView({ behavior: 'smooth' }), 0); }}>图鉴</button>
      </nav>
      <button className="header-cta" onClick={onHistory}>我的鉴定 <Icon name="history" size={18} /></button>
    </header>
  );
}

function CameraModal({ onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [captured, setCaptured] = useState(null);
  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器无法访问摄像头，请关闭此窗口并从相册上传。');
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        if (!active) return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError('摄像头授权未成功。你仍可以关闭此窗口并从相册上传。'));
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  const takePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return setError('摄像头画面尚未准备好，请稍等片刻。');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCaptured(canvas.toDataURL('image/jpeg', 0.82));
  };
  const confirm = async () => {
    const blob = await (await fetch(captured)).blob();
    onCapture(new File([blob], `自拍-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    onClose();
  };
  return <Modal title="授权摄像头自拍" onClose={onClose} wide><div className="camera-body"><div className="camera-stage">{captured ? <img src={captured} alt="自拍预览" /> : <video ref={videoRef} autoPlay muted playsInline aria-label="摄像头实时预览" /> }<span className="camera-reticle" aria-hidden="true" /></div><div className="camera-controls"><p><Icon name="lock" size={17} /> 摄像头只在此窗口内工作，关闭后立即停止。</p>{error ? <p className="form-error" role="alert">{error}</p> : null}{captured ? <><button className="primary-action" onClick={confirm}>使用这张照片 <Icon name="check" /></button><button className="secondary-action" onClick={() => setCaptured(null)}>重新拍摄 <Icon name="reset" /></button></> : <button className="primary-action" onClick={takePhoto} disabled={Boolean(error)}>拍下这一刻 <Icon name="camera" /></button>}</div></div></Modal>;
}

function FileSummary({ files, onClear }) {
  if (!files.length) return null;
  return <div className="file-summary" aria-live="polite"><span><strong>已捕获 {files.length} 份素材</strong>{files.map((file) => file.name).join(' / ')}</span><button onClick={onClear} aria-label="清空已选择文件"><Icon name="trash" size={18} /></button></div>;
}

function ParticipantComposer({ label, accent, value, onChange, onOpenCamera }) {
  const fileRef = useRef(null);
  const updateFiles = (list) => {
    try { onChange({ ...value, files: validateFiles(list, { mode: value.mode }), error: '' }); }
    catch (error) { onChange({ ...value, files: [], error: error.message }); }
  };
  return <section className={`participant-card ${accent}`} aria-label={`${label}输入`}><header><strong>{label}</strong><input aria-label={`${label}名称`} maxLength={12} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></header><div className="participant-types" role="tablist" aria-label={`${label}素材类型`}>{['photo', 'chat', 'text'].map((mode) => <button key={mode} role="tab" aria-selected={value.mode === mode} className={value.mode === mode ? 'active' : ''} onClick={() => onChange({ ...value, mode, files: [], input: '', error: '' })}>{mode === 'photo' ? '照片' : mode === 'chat' ? '聊天' : '文字'}</button>)}</div>{value.mode === 'text' ? <textarea className="participant-text" maxLength={500} placeholder="输入一句最有豪气的话" value={value.input} onChange={(event) => onChange({ ...value, input: event.target.value })} /> : value.mode === 'photo' ? <div className="participant-photo"><Icon name="camera" size={42} /><span>{value.files[0]?.name || '正脸入框，光线充足'}</span><div><button onClick={onOpenCamera}><Icon name="camera" size={17} />自拍</button><button onClick={() => fileRef.current?.click()}><Icon name="image" size={17} />上传照片</button></div></div> : <button className="participant-upload" onClick={() => fileRef.current?.click()}><Icon name="file" size={34} /><strong>{value.files.length ? `已选择 ${value.files.length} 份` : '上传聊天记录'}</strong><span>图片 / PDF / TXT / DOCX</span></button>}<input ref={fileRef} hidden type="file" multiple={value.mode === 'chat'} accept={value.mode === 'photo' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf,text/plain,.docx'} onChange={(event) => updateFiles(event.target.files)} />{value.error ? <p className="participant-error" role="alert">{value.error}</p> : null}</section>;
}

function PkForm({ onResult, addHistory }) {
  const [participants, setParticipants] = useState([
    { name: '选手 A', mode: 'photo', input: '', files: [], error: '' },
    { name: '选手 B', mode: 'text', input: '', files: [], error: '' },
  ]);
  const [cameraFor, setCameraFor] = useState(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const update = (index, value) => setParticipants((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  const start = async () => {
    if (!consent) return setError('请确认双方素材的合法授权与娱乐分析说明。');
    for (const participant of participants) {
      if (!participant.name.trim()) return setError('请为双方填写名称。');
      if (participant.mode === 'text' && participant.input.trim().length < 5) return setError(`${participant.name} 至少需要输入 5 个字。`);
      if (participant.mode !== 'text' && !participant.files.length) return setError(`${participant.name} 还没有提交豪气样本。`);
    }
    setError(''); setAnalyzing(true);
    try {
      const prepared = await Promise.all(participants.map(async (participant) => ({ ...participant, ...(participant.mode === 'text' ? { images: [], extractedText: '' } : await prepareFiles(participant.files)) })));
      let result;
      try { result = await analyzePkWithCloud(prepared); }
      catch { result = makeFallbackPk(prepared); }
      addHistory(result); onResult(result); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) { setError(reason.message || '素材处理失败，请检查文件后重试。'); }
    finally { setAnalyzing(false); }
  };
  return <div className="pk-form"><div className="pk-contestants"><ParticipantComposer label="选手 A" accent="blue" value={participants[0]} onChange={(value) => update(0, value)} onOpenCamera={() => setCameraFor(0)} /><span className="versus" aria-hidden="true">VS</span><ParticipantComposer label="选手 B" accent="orange" value={participants[1]} onChange={(value) => update(1, value)} onOpenCamera={() => setCameraFor(1)} /></div><label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><Icon name="check" size={15} /></span>我确认拥有双方素材的合法授权，并同意用于本次娱乐分析；本站不保存原始内容。</label>{error ? <p className="form-error" role="alert">PK 中止 / {error}</p> : null}<button className={`primary-action ${analyzing ? 'is-loading' : ''}`} onClick={start} disabled={analyzing} aria-busy={analyzing}>{analyzing ? '双方豪气汇聚中……' : <>开始豪气 PK <Icon name="sword" size={24} /></>}</button>{cameraFor !== null ? <CameraModal onClose={() => setCameraFor(null)} onCapture={(file) => update(cameraFor, { ...participants[cameraFor], files: [file], error: '' })} /> : null}</div>;
}

function AssayForm({ onResult, addHistory, mode, onModeChange }) {
  const [input, setInput] = useState(EXAMPLES[0]);
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [step, setStep] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);
  const selectMode = (next) => { onModeChange(next); setError(''); setFiles([]); setNotes([]); };
  const onFiles = (list) => {
    try { setFiles(validateFiles(list, { mode })); setError(''); }
    catch (reason) { setFiles([]); setError(reason.message); }
  };
  const start = async () => {
    if (!consent) return setError('请先确认内容使用权限与娱乐分析说明。');
    if (mode === 'text' && input.trim().length < 5) return setError('至少输入 5 个字，豪气才有迹可循。');
    if (mode !== 'text' && files.length === 0) return setError('先提交素材，鉴定仪还不能隔空捕捉豪气。');
    setError(''); setAnalyzing(true); setStep(0);
    const timer = window.setInterval(() => setStep((value) => Math.min(value + 1, ANALYSIS_STEPS.length - 1)), 520);
    const startedAt = Date.now();
    let result;
    try {
      const prepared = mode === 'text' ? null : await prepareFiles(files);
      setNotes(prepared?.notes || []);
      try { result = await analyzeWithCloud(input, mode, files, prepared); }
      catch {
        result = {
          ...analyze(mode === 'chat' ? prepared.extractedText : input, mode, files),
          fallbackNotice: MODEL_FALLBACK_NOTICE,
        };
      }
    } catch (reason) { window.clearInterval(timer); setAnalyzing(false); return setError(reason.message || '素材解析失败，请检查文件后重试。'); }
    const remainingDelay = Math.max(0, 2200 - (Date.now() - startedAt));
    window.setTimeout(() => { window.clearInterval(timer); addHistory(result); setAnalyzing(false); onResult(result); window.scrollTo({ top: 0, behavior: 'smooth' }); }, remainingDelay);
  };
  return (
    <div className={`assay-frame ${mode === 'pk' ? 'pk-assay' : ''}`}>
      <div className="mode-tabs" role="tablist" aria-label="鉴定方式">
        {MODES.map((item) => <button key={item.id} role="tab" aria-selected={mode === item.id} className={mode === item.id ? 'active' : ''} onClick={() => selectMode(item.id)}><Icon name={item.id === 'text' ? 'text' : item.id === 'photo' ? 'image' : item.id === 'chat' ? 'chat' : 'sword'} size={19} />{item.label}</button>)}
      </div>
      {mode === 'pk' ? <PkForm onResult={onResult} addHistory={addHistory} /> : (
        <>
          <div className={`input-area ${mode === 'photo' ? 'photo-input' : ''}`}>
            {mode === 'text' ? (
              <>
                <label htmlFor="jiahao-text">输入一句最有感觉的话</label>
                <textarea id="jiahao-text" maxLength={500} value={input} onChange={(event) => setInput(event.target.value)} />
                <span className="counter">{input.length} / 500</span>
                <div className="example-row" aria-label="换一个示例"><span>试试：</span>{EXAMPLES.slice(1).map((example, index) => <button key={example} onClick={() => setInput(example)}>0{index + 1}</button>)}</div>
              </>
            ) : mode === 'photo' ? (
              <div className="photo-capture">
                <div className="photo-capture-intro"><Icon name="camera" size={42} /><strong>自拍或上传一张照片</strong><span>{files[0]?.name || '正脸入框、光线充足，能捕获更完整的豪气信号'}</span></div>
                <div className="photo-capture-actions">
                  <button className="photo-native-source" onClick={() => fileRef.current?.click()}><Icon name="image" size={20} /><span><strong>拍照或从相册选择</strong><small>手机将打开系统图片来源菜单</small></span></button>
                  <button className="desktop-camera-action" onClick={() => setCameraOpen(true)}><Icon name="camera" size={19} /><span><strong>使用电脑摄像头</strong><small>仅桌面端</small></span></button>
                </div>
              </div>
            ) : (
              <button className={`drop-zone ${dragActive ? 'is-dragging' : ''}`} onClick={() => fileRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); onFiles(event.dataTransfer.files); }}><Icon name="file" size={34} /><strong>{files.length ? `已捕获 ${files.length} 份聊天素材` : MODES.find((item) => item.id === mode).hint}</strong><span>点击选择或拖到这里 · 最多 3 份 · 单份 10MB 内</span></button>
            )}
            <input ref={fileRef} type="file" accept={mode === 'photo' ? 'image/*' : 'image/jpeg,image/png,image/webp,application/pdf,text/plain,.docx'} multiple={mode === 'chat'} hidden onChange={(event) => onFiles(event.target.files)} />
          </div>
          <FileSummary files={files} onClear={() => setFiles([])} />
          <p className="privacy-note"><Icon name="lock" size={15} /> 摄像头只在授权后访问；聊天记录支持图片 / PDF / TXT / DOCX；内容不会持久化保存。</p>
          <label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><Icon name="check" size={15} /></span>我同意将内容发送至云端大模型做娱乐分析；本站不保存内容。</label>
          {notes.length ? <p className="processing-note">{notes.join('；')}</p> : null}
          {error ? <p className="form-error" role="alert">鉴定中止 / {error}</p> : null}
          <button className={`primary-action ${analyzing ? 'is-loading' : ''}`} onClick={start} disabled={analyzing} aria-busy={analyzing}>{analyzing ? ANALYSIS_STEPS[step] : <>开始鉴定 <Icon name="arrow" size={26} /></>}</button>
          {analyzing ? <><span className="sr-only" role="status" aria-live="polite">{ANALYSIS_STEPS[step]}</span><div className="analysis-progress" aria-hidden="true"><span style={{ width: `${(step + 1) * 20}%` }} /></div></> : null}
          {cameraOpen ? <CameraModal onClose={() => setCameraOpen(false)} onCapture={(file) => { setFiles([file]); setError(''); }} /> : null}
        </>
      )}
    </div>
  );
}

function Scale() {
  return <div className="scale"><div className="scale-head"><strong>豪气刻度</strong><span>普通人</span><span>自在极意豪</span></div><div className="scale-line">{Array.from({ length: 11 }, (_, i) => <i key={i} className={i > 6 ? 'hot' : ''}><b>{i * 10}</b></i>)}</div></div>;
}

function Home({ onResult, addHistory, mode, onModeChange }) {
  return (
    <main>
      <section className={`hero ${mode === 'pk' ? 'hero-pk' : ''}`} id="assay">
        <div className="hero-copy">
          <div className="scan-marker" aria-hidden="true">{mode === 'pk' ? '豪气目标 // 双人PK' : '豪气目标 // 已锁定'}</div>
          <h1>{mode === 'pk' ? <>双人对决，<br />谁更豪气？</> : <>你身上，<br />到底有多少豪气？</>}</h1>
          <p>{mode === 'pk' ? '双方可分别提交照片、聊天或文字，让模型综合裁决豪气高下。' : '自拍或上传一张照片，鉴定你的嘉豪浓度、物种与隐藏天赋。'}</p>
        </div>
        {mode === 'pk' ? <div className="hero-scan pk-preview" aria-hidden="true"><div className="pk-preview-head">对比结果预览</div><div className="pk-preview-portraits"><div><strong>选手 A</strong><span style={{ backgroundImage: `url(${ASSET_BASE_URL}/pixel-scan-1cd15197d2fa.jpg)` }} /></div><ul>{DIMENSION_META.map(([, label]) => <li key={label}>{label}</li>)}</ul><div><strong>选手 B</strong><span style={{ backgroundImage: `url(${ASSET_BASE_URL}/pixel-scan-1cd15197d2fa.jpg)` }} /></div></div><p>等待双方豪气样本</p></div> : <div className="hero-scan" style={{ '--hero-image': `url(${ASSET_BASE_URL}/pixel-scan-1cd15197d2fa.jpg)` }} aria-hidden="true"><span>豪气波形<br />锁定中……</span><i /></div>}
        <AssayForm onResult={onResult} addHistory={addHistory} mode={mode} onModeChange={onModeChange} />
        <Scale />
        <div className="document-meta"><span>娱乐档案<br /><b>仅供鉴定娱乐使用</b></span><span className="barcode" /><span>嘉豪鉴定样本<br /><b>请勿过度当真</b></span></div>
      </section>
      <SpeciesGallery />
      <section className="how-it-works">
        <div><small>第一步 / 输入</small><strong>投喂一句豪言</strong><p>照片、聊天截图或一句不经意的话，都能成为证据。</p></div>
        <div><small>第二步 / 鉴定</small><strong>六维捕获豪气</strong><p>神秘、炫耀、小众、深情、镜头感与豪言同时扫描。</p></div>
        <div><small>第三步 / 传播</small><strong>生成鉴定海报</strong><p>带着你的分数、物种与判词，去群聊里接受复核。</p></div>
      </section>
    </main>
  );
}

function downloadQuoteCard(quote, level, style) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070b12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#2f7bff';
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 42, 996, 1356);
  ctx.strokeStyle = 'rgba(115,215,255,.28)';
  ctx.strokeRect(68, 68, 944, 1304);
  ctx.fillStyle = '#2f7bff';
  ctx.fillRect(68, 68, 250, 8);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '800 48px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('嘉豪鉴定所', 92, 152);
  ctx.fillStyle = '#73d7ff';
  ctx.font = '700 25px monospace';
  ctx.fillText('JIAHAO QUOTE GENERATOR', 92, 198);
  ctx.fillStyle = 'rgba(47,123,255,.22)';
  ctx.font = '900 220px Arial, sans-serif';
  ctx.fillText('“', 88, 470);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '800 62px "PingFang SC", "Microsoft YaHei", sans-serif';
  drawWrappedText(ctx, quote.replace(/\n+/g, ' '), 118, 540, 840, 96, 6);
  ctx.fillStyle = '#73d7ff';
  ctx.font = '700 28px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`${level} · ${style}嘉豪`, 118, 1168);
  ctx.strokeStyle = 'rgba(115,215,255,.3)';
  ctx.beginPath(); ctx.moveTo(118, 1218); ctx.lineTo(962, 1218); ctx.stroke();
  ctx.fillStyle = 'rgba(234,242,255,.65)';
  ctx.font = '600 24px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('不是所有沉默都代表无话可说。', 118, 1280);
  ctx.fillStyle = '#2f7bff';
  ctx.fillRect(810, 1260, 152, 42);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '800 20px monospace';
  ctx.fillText('JH / 语录', 829, 1288);
  const link = document.createElement('a');
  link.download = `嘉豪语录-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function QuoteGenerator() {
  const [mode, setMode] = useState('hao');
  const [input, setInput] = useState('今天有点累。');
  const [level, setLevel] = useState('豪气冲天');
  const [style, setStyle] = useState('高冷');
  const [output, setOutput] = useState('不是累，只是有些事情，说了你们也不一定懂。');
  const [generating, setGenerating] = useState(false);
  const [variation, setVariation] = useState(0);
  const [notice, setNotice] = useState('');
  const [inputError, setInputError] = useState('');
  const [modelStatus, setModelStatus] = useState(null);
  const [outputConfig, setOutputConfig] = useState({ mode: 'hao', level: '豪气冲天', style: '高冷' });

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setNotice('');
    setInputError('');
  };

  const generate = async (nextVariation = variation + 1) => {
    if (input.trim().length < 2) {
      setInputError('请至少输入两个字，再生成语录。');
      return undefined;
    }
    setInputError('');
    setGenerating(true);
    setNotice('');
    setVariation(nextVariation);
    const requestedConfig = { mode, level, style };
    const startedAt = Date.now();
    let nextOutput;
    let nextModelStatus;
    try {
      const generated = await generateQuoteWithCloud(input, mode, level, style);
      nextOutput = generated.output;
      nextModelStatus = { source: generated.source };
    } catch {
      nextOutput = makeFallbackQuote(input, mode, level, style, nextVariation);
      nextModelStatus = { source: '豪之算法', fallbackNotice: MODEL_FALLBACK_NOTICE };
    }
    const delay = Math.max(0, 620 - (Date.now() - startedAt));
    window.setTimeout(() => {
      setOutput(nextOutput);
      setOutputConfig(requestedConfig);
      setModelStatus(nextModelStatus);
      setGenerating(false);
    }, delay);
    return undefined;
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(output); }
    catch {
      const area = document.createElement('textarea');
      area.value = output; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    setNotice('已复制，可以去群聊里无意地发一下了。');
  };

  return (
    <main className="quote-page">
      <section className="quote-intro">
        <h1>把一句普通话，调成嘉豪频道。</h1>
        <p>输入一句话，选择豪气与风格，生成一条刚好值得截图的嘉豪语录。</p>
      </section>
      <section className="quote-workspace" aria-label="嘉豪语录生成工作台">
        <section className="quote-editor" aria-label="语录设置">
          <div className="quote-field-head"><h2>原句</h2><span>{input.length} / 300</span></div>
          <textarea aria-label="要转换的原句" aria-invalid={Boolean(inputError)} aria-describedby={inputError ? 'quote-input-error' : undefined} maxLength={300} value={input} onChange={(event) => { setInput(event.target.value); setInputError(''); }} />
          {inputError ? <p id="quote-input-error" className="form-error quote-input-error" role="alert">{inputError}</p> : null}
          <div className="quote-mode-row">
            <span>转换方式</span>
            <div className="quote-mode" role="group" aria-label="转换方向">
              <button type="button" aria-pressed={mode === 'hao'} className={mode === 'hao' ? 'active' : ''} onClick={() => changeMode('hao')}>豪化</button>
              <button type="button" aria-pressed={mode === 'dehao'} className={mode === 'dehao' ? 'active' : ''} onClick={() => changeMode('dehao')}>一键说人话</button>
            </div>
          </div>
          <fieldset className="quote-levels" disabled={mode === 'dehao'}>
            <legend>豪气等级</legend>
            <div>{QUOTE_LEVELS.map((item) => <button type="button" key={item} className={level === item ? 'active' : ''} aria-pressed={level === item} onClick={() => setLevel(item)}><i />{item}</button>)}</div>
          </fieldset>
          <fieldset className="quote-styles" disabled={mode === 'dehao'}>
            <legend>风格模式</legend>
            <div>{QUOTE_STYLES.map((item) => <button type="button" key={item} className={style === item ? 'active' : ''} aria-pressed={style === item} onClick={() => setStyle(item)}>{item}</button>)}</div>
          </fieldset>
          <button className={`primary-action quote-generate ${generating ? 'is-loading' : ''}`} onClick={() => generate()} disabled={generating}>{generating ? '豪气正在汇聚……' : <><Icon name="spark" />{mode === 'dehao' ? '一键把嘉豪说人话' : '生成嘉豪语录'}</>}</button>
        </section>
        <section className="quote-output" aria-label="生成结果">
          <header><h2>生成结果</h2><span>{outputConfig.mode === 'dehao' ? '去豪化 · 正常表达' : `${outputConfig.level} · ${outputConfig.style}`}</span></header>
          {modelStatus ? <ModelSourceNotice source={modelStatus.source} fallbackNotice={modelStatus.fallbackNotice} compact /> : null}
          <blockquote aria-live="polite">{output}</blockquote>
          <div className="quote-actions">
            <button onClick={copy}><Icon name="copy" size={18} />复制语录</button>
            <button onClick={() => { downloadQuoteCard(output, outputConfig.level, outputConfig.style); setNotice('卡片已生成；如未自动保存，请在浏览器菜单中下载图片。'); }}><Icon name="download" size={18} />保存卡片</button>
            <button onClick={() => generate(variation + 1)}><Icon name="reset" size={18} />换一个</button>
          </div>
          <p className="quote-privacy"><Icon name="lock" size={14} /> 内容仅用于本次生成，不公开原句</p>
          {notice ? <p className="quote-notice" role="status">{notice}</p> : null}
        </section>
      </section>
    </main>
  );
}

function SpeciesGallery({ selected }) {
  const [active, setActive] = useState(selected || 0);
  const railRef = useRef(null);
  const activeRef = useRef(active);
  const item = SPECIES[active];
  useEffect(() => { activeRef.current = active; }, [active]);
  const centerRailCard = (index, smooth) => {
    const rail = railRef.current;
    const card = rail?.children[index];
    if (!rail || !card) return;
    // Keep the scroll inside the rail: scrollIntoView would also drag the
    // whole page down to the gallery on first load.
    rail.scrollTo({
      left: card.offsetLeft - (rail.clientWidth - card.clientWidth) / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => centerRailCard(active, false));
    return () => cancelAnimationFrame(frame);
  }, []);
  const selectSpecies = (index) => {
    setActive(index);
    centerRailCard(index, true);
  };
  const syncSpeciesFromRail = () => {
    const rail = railRef.current;
    if (!rail) return;
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let closest = 0;
    let distance = Number.POSITIVE_INFINITY;
    [...rail.children].forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const nextDistance = Math.abs(cardCenter - center);
      if (nextDistance < distance) { closest = index; distance = nextDistance; }
    });
    if (closest !== activeRef.current) setActive(closest);
  };
  return (
    <section className="species-section" id="species">
      <div className="section-number">物种档案 / 九种</div>
      <div className="species-title"><h2>嘉豪物种图鉴</h2><p>同一种豪气，也有不同的进化路线。<br />滑动人物档案，认领你的精神分支。</p></div>
      <div className="species-stage">
        <div className="species-portrait" style={{ backgroundImage: `url(${item.asset})`, backgroundPosition: item.crop }}><span>{String(active + 1).padStart(2, '0')}</span></div>
        <div className="species-detail">
          <small>{item.en}</small><h3>{item.name}</h3><p>{item.summary}</p><blockquote>“{item.clue}”</blockquote>
        </div>
      </div>
      <div className="species-rail-shell">
        <span>滑动切换档案</span><i aria-hidden="true" />
        <div ref={railRef} className="species-rail" role="list" aria-label="嘉豪人物档案" onScroll={syncSpeciesFromRail}>
          {SPECIES.map((species, index) => <button key={species.name} type="button" role="listitem" className={index === active ? 'active' : ''} onClick={() => selectSpecies(index)} aria-pressed={index === active} aria-label={`查看${species.name}`} style={{ backgroundImage: `linear-gradient(180deg, transparent 28%, rgba(7,11,18,.92)), url(${species.asset})`, backgroundPosition: species.crop }}><small>{String(index + 1).padStart(2, '0')}</small><strong>{species.name}</strong><em>{species.en}</em></button>)}
        </div>
      </div>
    </section>
  );
}

function PkResult({ result, onReset, onPoster }) {
  const winnerIndex = result.battle.winner === 'A' ? 0 : result.battle.winner === 'B' ? 1 : -1;
  return <main className="pk-result-page"><section className="pk-result-hero"><div className="result-heading"><span className="completion-mark">/// PK 裁决完成 <em>{result.battle.source}</em></span><button className="secondary-action top-reset" onClick={onReset}>再来一局 <Icon name="reset" size={18} /></button></div><ModelSourceNotice source={result.battle.source} fallbackNotice={result.battle.fallbackNotice} /><div className="battle-verdict"><small>模型综合裁决</small><h1>{result.battle.title}</h1><p>{result.battle.reason}</p><div>{(result.battle.decisiveDimensions || []).map((item) => <span key={item}>{item}</span>)}</div></div><div className="pk-result-grid">{result.participants.map((participant, index) => <section key={`${participant.name}-${index}`} className={`pk-player-result ${index === 0 ? 'blue' : 'orange'} ${winnerIndex === index ? 'winner' : ''}`}><header><span>{index === 0 ? '选手 A' : '选手 B'}</span>{winnerIndex === index ? <strong>本场胜者</strong> : null}</header><h2>{participant.name}</h2><div className="pk-score"><AnimatedNumber value={participant.score} /><small>/100</small></div><h3>{participant.type}</h3><p>{participant.verdict}</p><div className="pk-dimensions">{DIMENSION_META.map(([key, label]) => <div key={key}><span>{label}</span><i><b style={{ width: `${participant.dimensions[key]}%` }} /></i><strong>{participant.dimensions[key]}</strong></div>)}</div></section>)}</div><div className="result-actions"><button className="primary-action" onClick={onPoster}>生成双人海报 <Icon name="download" size={24} /></button><button className="secondary-action" onClick={onReset}>再来一局 <Icon name="reset" size={20} /></button></div></section><section className="pk-commentary"><div><small>对战编号 / {result.id}</small><h2>豪气没有标准答案，<br />但对决必须有个说法。</h2></div><p>{result.battle.reason}<span>模型综合裁决仅供娱乐，不构成对任何人的事实判断。</span></p></section></main>;
}

function Result({ result, onReset, onPoster }) {
  const speciesIndex = Math.max(0, SPECIES.findIndex((item) => item.name === result.type));
  return (
    <main className="result-page">
      <section className="result-hero">
        <div className="result-heading"><span className="completion-mark">/// 鉴定完成 <em>{result.source || '豪之算法'}</em></span><button className="secondary-action top-reset" onClick={onReset}>再测一次 <Icon name="reset" size={18} /></button></div>
        <ModelSourceNotice source={result.source} fallbackNotice={result.fallbackNotice} />
        <div className="result-grid">
          <div className="score-block"><small>嘉豪指数</small><div className="score"><AnimatedNumber value={result.score} /><em>/100</em></div><div className="approval-stamp">鉴定通过</div><small>嘉豪物种</small><h1>{result.type}</h1><div className="verdict"><span>鉴定结论</span><strong>{result.verdict}</strong></div><div className="trait-signals" aria-label="捕获到的嘉豪特征">{(result.traits || ['信号稳定', '豪气待复核']).map((trait) => <span key={trait}>{trait}</span>)}</div></div>
          <div className="dimension-block"><h2>六维豪气分析</h2><Radar dimensions={result.dimensions} />
            <div className="dimension-list">{DIMENSION_META.map(([key, label]) => <div key={key}><span>{label}</span><i><b style={{ width: `${result.dimensions[key]}%` }} /></i><strong>{result.dimensions[key]}</strong></div>)}</div>
          </div>
          <aside className="share-preview">
            <div className="poster-mini"><span className="poster-title">嘉豪鉴定所</span><div className="poster-image" style={{ backgroundImage: `url(${SPECIES[speciesIndex]?.asset || SPECIES[0].asset})`, backgroundPosition: SPECIES[speciesIndex]?.crop || '0 center' }} /><small>{result.id}</small><b>{result.score}</b><h3>{result.type}</h3><p>{result.verdict}</p><span className="poster-url">扫码再次鉴定</span></div>
          </aside>
        </div>
        <div className="result-actions"><button className="primary-action" onClick={onPoster}>生成鉴定海报 <Icon name="download" size={24} /></button><button className="secondary-action" onClick={onReset}>再测一次 <Icon name="reset" size={20} /></button></div>
      </section>
      <section className="evidence-section">
        <div className="evidence-copy"><small>鉴定依据 / {result.id}</small><h2>鉴定不是玄学，<br />豪气都有迹可循。</h2><ol>{result.evidence.map((item, index) => <li key={item}><span>0{index + 1}</span>{item}</li>)}</ol></div>
        <div className="commentary"><small>鉴定官总评</small><p>{result.comment}</p><span>建议 / 仅供娱乐，请勿过度修炼。</span></div>
      </section>
      <SpeciesGallery selected={speciesIndex} />
    </main>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const handleKey = (event) => {
      if (event.key === 'Escape') return onClose();
      if (event.key !== 'Tab') return undefined;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])].filter((element) => !element.hidden && element.offsetParent !== null);
      if (!focusable.length) return undefined;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return undefined;
    };
    closeRef.current?.focus();
    document.addEventListener('keydown', handleKey);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', handleKey); document.body.classList.remove('modal-open'); previousFocus?.focus?.(); };
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button ref={closeRef} onClick={onClose} aria-label="关闭"><Icon name="close" /></button></header>{children}</section></div>;
}

function PosterModal({ result, onClose }) {
  const [dataUrl, setDataUrl] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setDataUrl('');
    setGenerationError('');
    const createPoster = result.kind === 'pk' ? makePkPoster : makePoster;
    createPoster(result).then((url) => {
      if (active) setDataUrl(url);
    }).catch(() => {
      if (active) setGenerationError('海报生成失败，请检查网络后重试。');
    });
    return () => { active = false; };
  }, [result, attempt]);
  const download = () => {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = result.kind === 'pk' ? `嘉豪PK-${result.battle.title}.png` : `嘉豪鉴定-${result.score}-${result.type}.png`;
    link.href = dataUrl;
    link.click();
  };
  const share = async () => {
    if (!dataUrl) return;
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], result.kind === 'pk' ? '嘉豪双人PK.png' : `嘉豪鉴定-${result.score}.png`, { type: 'image/png' });
    const text = result.kind === 'pk' ? `双人豪气 PK 结果：${result.battle.title}` : `我的嘉豪指数是 ${result.score}，物种：${result.type}`;
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: result.kind === 'pk' ? '双人豪气 PK' : '我的嘉豪鉴定', text, files: [file] });
    else download();
  };
  return <Modal title={result.kind === 'pk' ? '分享双人 PK 海报' : '分享你的鉴定海报'} onClose={onClose} wide><div className="poster-modal-body">{dataUrl ? <img src={dataUrl} alt={result.kind === 'pk' ? `双人豪气 PK：${result.battle.title}` : `嘉豪指数 ${result.score}，${result.type}鉴定海报`} /> : generationError ? <div className="poster-error" role="alert"><strong>{generationError}</strong><button className="secondary-action" onClick={() => setAttempt((value) => value + 1)}>重新生成</button></div> : <div className="poster-loading">豪气印刷中……</div>}<div className="poster-controls"><p>海报尺寸 1080 × 1440，仅在浏览器本地生成，不包含原始照片、聊天或文字内容。</p><button className="primary-action" disabled={!dataUrl} onClick={download}>下载海报 <Icon name="download" /></button><button className="secondary-action" disabled={!dataUrl} onClick={share}>分享给朋友 <Icon name="share" /></button></div></div></Modal>;
}

function HistoryModal({ history, onClose, onSelect, onClear }) {
  return <Modal title="鉴定记录" onClose={onClose}><div className="history-list">{history.length ? history.map((item) => <button key={`${item.id}-${item.createdAt}`} onClick={() => { onSelect(item); onClose(); }}><span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span><strong>{item.kind === 'pk' ? 'PK' : item.score}</strong><em>{item.kind === 'pk' ? item.battle.title : item.type}</em><Icon name="arrow" size={17} /></button>) : <p className="empty-history">还没有鉴定记录。<br />第一份豪气档案正在等你。</p>}</div>{history.length > 0 && <button className="text-action" onClick={onClear}>清空本地记录</button>}</Modal>;
}

export default function App() {
  const [page, setPage] = useState('assay');
  const [assayMode, setAssayMode] = useState('photo');
  const [result, setResult] = useState(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [assayScrollRequest, setAssayScrollRequest] = useState(0);
  const { history, add, clear } = useHistory();
  const year = useMemo(() => new Date().getFullYear(), []);
  useEffect(() => {
    if (!assayScrollRequest || page !== 'assay' || result) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [assayScrollRequest, page, result]);
  const navigate = (nextPage) => {
    setPage(nextPage);
    if (nextPage !== 'assay') setResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const navigateToAssay = () => {
    setPage('assay');
    setResult(null);
    setAssayScrollRequest((request) => request + 1);
  };
  return (
    <div className="app-shell">
      <Header page={page} onNavigate={navigate} onAssay={navigateToAssay} onHistory={() => setHistoryOpen(true)} />
      {page === 'quotes' ? <QuoteGenerator /> : result ? (result.kind === 'pk' ? <PkResult result={result} onReset={() => { setAssayMode('pk'); setResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onPoster={() => setPosterOpen(true)} /> : <Result result={result} onReset={() => { setResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onPoster={() => setPosterOpen(true)} />) : <Home onResult={setResult} addHistory={add} mode={assayMode} onModeChange={setAssayMode} />}
      <footer><strong>嘉豪鉴定所</strong><span>© {year} 嘉豪鉴定开源实验项目</span><span>大模型娱乐生成 · 本站不保存内容 · 不构成任何事实判断</span></footer>
      {posterOpen && <PosterModal result={result} onClose={() => setPosterOpen(false)} />}
      {historyOpen && <HistoryModal history={history} onClose={() => setHistoryOpen(false)} onSelect={(item) => { setPage('assay'); setResult(item); window.scrollTo({ top: 0 }); }} onClear={clear} />}
    </div>
  );
}
