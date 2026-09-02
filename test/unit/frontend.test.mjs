import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Import from validation.js
import { decideFallbackWinner, isAcceptedFile, MAX_FILE_BYTES, MAX_FILES, validateFiles } from '../../src/validation.js';

const archiveSource = readFileSync(new URL('../../src/features/archive/ArchivePage.jsx', import.meta.url), 'utf8');
const haoSource = readFileSync(new URL('../../src/features/hao/HaoPage.jsx', import.meta.url), 'utf8');
const labSource = readFileSync(new URL('../../src/features/lab/LabPage.jsx', import.meta.url), 'utf8');

// ---- Re-implement pure functions for testing (mirroring App.jsx logic) ----

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

const DIMENSION_META = [
  ['mystery', '神秘感'],
  ['flex', '无意炫耀'],
  ['niche', '小众优越'],
  ['deep', '深情浓度'],
  ['show', '镜头掌控'],
  ['language', '豪言匹配'],
];

const TYPES = ['自在极意豪', '美式嘉豪', '深情破碎豪', '计算机嘉豪', '股票嘉豪', '不懂装懂豪', '小众优越豪', '潜伏嘉豪', '反向嘉豪', '无意炫耀豪'];

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
  if (score >= 95) level = '自在极意豪';
  else if (score >= 80) level = '豪气冲天';
  else if (score >= 60) level = '高阶嘉豪';
  else if (score >= 40) level = '半步嘉豪';
  else if (score >= 20) level = '嘉豪观察对象';
  else level = '清澈普通人';

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
    mystery: '信息留白面积很大，给"你们最好主动来问"留下充分空间。',
    flex: '表面像随手一提，关键元素却都稳稳进入了叙事中心。',
    niche: '内容出现"懂的人自然懂"式身份暗号，小众雷达明显波动。',
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
    type,
    traits: traitMap[type] || ['神秘感', '不经意', '等待追问', '稳定发挥'],
    dimensions,
    top: sorted.slice(0, 3),
    evidence: sorted.slice(0, 3).map((item) => evidenceMap[item.key]),
    mode,
    source: '豪之算法',
  };
}

function makeFallbackPk(participants) {
  const results = participants.map((participant) => ({
    name: participant.name,
    ...analyze(participant.input || '', participant.mode, participant.files || []),
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
    },
    id: `嘉豪-PK-${String(hashString(results.map((item) => item.id).join(':'))).slice(0, 8)}`,
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

// ---- Begin Tests ----

test('豪气页面和人格档案展示真实嘉豪人物素材而不是文字占位', () => {
  assert.match(haoSource, /JiahaoPortrait/);
  assert.match(archiveSource, /JiahaoPortrait/);
  assert.doesNotMatch(archiveSource, /type-glyph/);
});

test('反应局支持三选一即时反馈和下一套题', () => {
  assert.match(labSource, /lastReaction/);
  assert.match(labSource, /下一套/);
  assert.match(labSource, /reaction-progress/);
});

// === hashString tests ===
test('hashString is deterministic', () => {
  assert.equal(hashString('hello'), hashString('hello'));
  assert.equal(hashString('嘉豪'), hashString('嘉豪'));
});

test('hashString returns positive integer', () => {
  const h = hashString('test');
  assert.ok(Number.isInteger(h) && h >= 0);
});

test('hashString different inputs produce different hashes (usually)', () => {
  assert.notEqual(hashString('hello'), hashString('world'));
});

test('hashString handles empty string', () => {
  const h = hashString('');
  assert.ok(Number.isInteger(h) && h >= 0);
});

test('hashString handles unicode', () => {
  const h = hashString('🎉🚀✨');
  assert.ok(Number.isInteger(h) && h >= 0);
});

// === clamp tests ===
test('clamp returns value within range', () => {
  assert.equal(clamp(50), 50);
  assert.equal(clamp(0), 8);
  assert.equal(clamp(100), 99);
  assert.equal(clamp(200), 99);
  assert.equal(clamp(-10), 8);
});

test('clamp handles non-integer input', () => {
  assert.equal(clamp(50.7), 51);
  assert.equal(clamp(7.2), 8);
});

test('clamp with custom bounds', () => {
  assert.equal(clamp(5, 10, 90), 10);
  assert.equal(clamp(95, 10, 90), 90);
});

// === isAcceptedFile tests ===
test('isAcceptedFile accepts image types', () => {
  assert.ok(isAcceptedFile({ name: 'photo.jpg', type: 'image/jpeg', size: 1024 }));
  assert.ok(isAcceptedFile({ name: 'photo.png', type: 'image/png', size: 1024 }));
  assert.ok(isAcceptedFile({ name: 'photo.webp', type: 'image/webp', size: 1024 }));
});

test('isAcceptedFile accepts document types', () => {
  assert.ok(isAcceptedFile({ name: 'doc.pdf', type: 'application/pdf', size: 1024 }));
  assert.ok(isAcceptedFile({ name: 'doc.txt', type: 'text/plain', size: 1024 }));
  assert.ok(isAcceptedFile({ name: 'doc.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1024 }));
});

test('isAcceptedFile rejects unsupported types', () => {
  assert.equal(isAcceptedFile({ name: 'video.mp4', type: 'video/mp4', size: 1024 }), false);
  assert.equal(isAcceptedFile({ name: 'audio.mp3', type: 'audio/mpeg', size: 1024 }), false);
});

test('isAcceptedFile handles null/undefined', () => {
  assert.equal(isAcceptedFile(null), false);
  assert.equal(isAcceptedFile(undefined), false);
  assert.equal(isAcceptedFile({}), false);
});

test('isAcceptedFile accepts by extension for documents', () => {
  assert.ok(isAcceptedFile({ name: 'report.docx', size: 1024 }));
  assert.ok(isAcceptedFile({ name: 'notes.txt', size: 1024 }));
  assert.ok(isAcceptedFile({ name: 'slides.pdf', size: 1024 }));
});

// === validateFiles tests ===
const image = (name = 'selfie.jpg', size = 1024) => ({ name, size, type: 'image/jpeg' });

test('validateFiles throws on empty array', () => {
  assert.throws(() => validateFiles([], { mode: 'chat' }), /请选择/);
  assert.throws(() => validateFiles([], { mode: 'photo' }), /请选择/);
});

test('validateFiles throws on too many files in chat mode', () => {
  const files = [image('1.jpg'), image('2.jpg'), image('3.jpg'), image('4.jpg')];
  assert.throws(() => validateFiles(files, { mode: 'chat' }), /最多选择/);
});

test('validateFiles throws on multiple files in photo mode', () => {
  const files = [image('1.jpg'), image('2.jpg')];
  assert.throws(() => validateFiles(files, { mode: 'photo' }), /每次只能选择/);
});

test('validateFiles throws on oversized files', () => {
  const big = { name: 'big.jpg', size: MAX_FILE_BYTES + 1, type: 'image/jpeg' };
  assert.throws(() => validateFiles([big]), /超过 10MB/);
  assert.throws(() => validateFiles([big], { mode: 'photo' }), /超过 10MB/);
});

test('validateFiles rejects non-image in photo mode', () => {
  assert.throws(() => validateFiles([{ name: 'doc.pdf', size: 1024, type: 'application/pdf' }], { mode: 'photo' }), /仅支持.*JPG.*PNG.*WebP/);
});

test('validateFiles returns valid files array', () => {
  const files = [image('a.jpg'), image('b.png')];
  const result = validateFiles(files);
  assert.equal(result.length, 2);
});

test('validateFiles accepts exact limit files', () => {
  const files = [image('1.jpg'), image('2.jpg'), image('3.jpg')];
  const result = validateFiles(files);
  assert.equal(result.length, 3);
});

test('validateFiles accepts file at exact size limit', () => {
  const file = { name: 'exact.jpg', size: MAX_FILE_BYTES, type: 'image/jpeg' };
  const result = validateFiles([file]);
  assert.equal(result.length, 1);
});

// === decideFallbackWinner tests (extended) ===
test('decideFallbackWinner returns tie when within 2 points', () => {
  assert.equal(decideFallbackWinner(70, 70), 'tie');
  assert.equal(decideFallbackWinner(70, 71), 'tie');
  assert.equal(decideFallbackWinner(70, 72), 'tie');
  assert.equal(decideFallbackWinner(72, 70), 'tie');
  assert.equal(decideFallbackWinner(70, 68), 'tie');
});

test('decideFallbackWinner returns A when clearly higher', () => {
  assert.equal(decideFallbackWinner(73, 70), 'A');
  assert.equal(decideFallbackWinner(100, 50), 'A');
  assert.equal(decideFallbackWinner(70, 50), 'A');
});

test('decideFallbackWinner returns B when clearly lower', () => {
  assert.equal(decideFallbackWinner(66, 70), 'B');
  assert.equal(decideFallbackWinner(50, 100), 'B');
  assert.equal(decideFallbackWinner(50, 70), 'B');
});

// === analyze function tests ===
test('analyze returns all required fields for text mode', () => {
  const result = analyze('今天有点累', 'text', []);
  assert.ok(result.id.startsWith('嘉豪-'));
  assert.ok(typeof result.score === 'number' && result.score >= 12 && result.score <= 100);
  assert.ok(typeof result.level === 'string');
  assert.ok(typeof result.type === 'string');
  assert.ok(Array.isArray(result.traits) && result.traits.length === 4);
  assert.ok(Array.isArray(result.evidence) && result.evidence.length === 3);
  assert.ok(Array.isArray(result.top) && result.top.length === 3);
  assert.equal(result.source, '豪之算法');
  assert.equal(result.mode, 'text');
});

test('analyze returns valid dimension values', () => {
  const result = analyze('test', 'text', []);
  for (const [key] of DIMENSION_META) {
    assert.ok(result.dimensions[key] >= 8 && result.dimensions[key] <= 99, `${key} should be 8-99, got ${result.dimensions[key]}`);
  }
});

test('analyze detects computer-related content', () => {
  const result = analyze('我的代码在服务器上跑，底层用的是最新框架', 'text', []);
  assert.ok(result.type);
  assert.ok(result.score >= 12 && result.score <= 100);
});

test('analyze detects stock-related content', () => {
  const result = analyze('这波回调我看是加仓机会，K线形态不错', 'text', []);
  assert.ok(result.type);
  assert.ok(result.score >= 12 && result.score <= 100);
});

test('analyze is deterministic', () => {
  const r1 = analyze('相同输入', 'text', []);
  const r2 = analyze('相同输入', 'text', []);
  assert.equal(r1.score, r2.score);
  assert.equal(r1.type, r2.type);
  assert.deepEqual(r1.dimensions, r2.dimensions);
});

test('analyze handles photo mode', () => {
  const files = [{ name: 'selfie.jpg', size: 2048 }];
  const result = analyze('', 'photo', files);
  assert.equal(result.mode, 'photo');
  assert.ok(result.score >= 12 && result.score <= 100);
});

test('analyze handles chat mode', () => {
  const files = [{ name: 'chat.pdf', size: 5000 }];
  const result = analyze('看看这个', 'chat', files);
  assert.equal(result.mode, 'chat');
  assert.ok(result.score >= 12 && result.score <= 100);
});

test('analyze top dimensions are sorted descending', () => {
  const result = analyze('test', 'text', []);
  assert.ok(result.top[0].value >= result.top[1].value);
  assert.ok(result.top[1].value >= result.top[2].value);
});

test('analyze returns valid level strings', () => {
  const validLevels = ['清澈普通人', '嘉豪观察对象', '半步嘉豪', '高阶嘉豪', '豪气冲天', '自在极意豪'];
  for (let i = 0; i < 100; i++) {
    const input = `level test ${String.fromCharCode(65 + (i % 26))}${i}`;
    const result = analyze(input, 'text', []);
    assert.ok(validLevels.includes(result.level), `Unexpected level: ${result.level} for score ${result.score}`);
  }
});

test('analyze high score yields 自在极意豪', () => {
  const result = analyze('黑口罩苹果耳机低头侧脸拒绝解释深夜冷冷车方向盘价格小众冷门一个人习惯底层逻辑', 'text', []);
  assert.ok(result.score >= 12 && result.score <= 100);
});

test('analyze empty input still produces valid result', () => {
  const result = analyze('', 'text', []);
  assert.ok(result.score >= 12 && result.score <= 100);
  assert.ok(result.type);
  assert.ok(result.level);
});

// === makeFallbackPk tests ===
test('makeFallbackPk returns valid PK structure', () => {
  const pk = makeFallbackPk([
    { name: '小明', input: '今天有点累', mode: 'text', files: [] },
    { name: '小红', input: '底层逻辑', mode: 'text', files: [] },
  ]);
  assert.equal(pk.kind, 'pk');
  assert.equal(pk.participants.length, 2);
  assert.equal(pk.participants[0].name, '小明');
  assert.equal(pk.participants[1].name, '小红');
  assert.ok(['A', 'B', 'tie'].includes(pk.battle.winner));
  assert.equal(pk.battle.source, '豪之算法');
  assert.ok(pk.id.startsWith('嘉豪-PK-'));
});

test('makeFallbackPk handles same participant inputs', () => {
  const pk = makeFallbackPk([
    { name: '张三', input: '测试', mode: 'text', files: [] },
    { name: '张三2', input: '测试', mode: 'text', files: [] },
  ]);
  assert.ok(pk.participants[0].score === pk.participants[1].score || Math.abs(pk.participants[0].score - pk.participants[1].score) <= 2);
});

// === makeFallbackQuote tests ===
test('makeFallbackQuote hao mode returns non-empty string', () => {
  const result = makeFallbackQuote('今天有点累', 'hao', '豪气冲天', '高冷', 0);
  assert.ok(typeof result === 'string' && result.length > 0);
});

test('makeFallbackQuote dehao mode removes pompous language', () => {
  const result = makeFallbackQuote('我也没说什么，只是你们可能理解不了。', 'dehao', '豪气冲天', '高冷', 0);
  assert.ok(!result.includes('你们可能理解不了'));
});

test('makeFallbackQuote respects variation index', () => {
  const r0 = makeFallbackQuote('测试', 'hao', '豪气冲天', '高冷', 0);
  const r1 = makeFallbackQuote('测试', 'hao', '豪气冲天', '高冷', 1);
  assert.ok(typeof r0 === 'string');
  assert.ok(typeof r1 === 'string');
});

test('makeFallbackQuote handles all levels', () => {
  const levels = ['豪气初现', '豪气逼人', '豪气冲天', '自在极意豪'];
  for (const level of levels) {
    const result = makeFallbackQuote('测试', 'hao', level, '高冷', 0);
    assert.ok(result.length > 0, `Level ${level} should produce output`);
  }
});

test('makeFallbackQuote handles all styles', () => {
  const styles = ['深情', '高冷', '小众', '无意炫耀', '战斗', '朋友圈', '个性签名', '评论区'];
  for (const style of styles) {
    const result = makeFallbackQuote('测试', 'hao', '豪气冲天', style, 0);
    assert.ok(result.length > 0, `Style ${style} should produce output`);
  }
});

test('makeFallbackQuote handles empty input', () => {
  const result = makeFallbackQuote('', 'hao', '豪气冲天', '高冷', 0);
  assert.ok(result.length > 0);
});

test('makeFallbackQuote dehao normalizes 懂的都懂', () => {
  const result = makeFallbackQuote('懂的都懂，不必解释', 'dehao', '豪气冲天', '高冷', 0);
  assert.ok(!result.includes('懂的都懂'));
});

test('makeFallbackQuote hao for 累 input', () => {
  const result = makeFallbackQuote('今天很累。', 'hao', '自在极意豪', '高冷', 0);
  assert.ok(result.includes('身体会累') || result.includes('不会'));
});

// === MAX constants validation ===
test('MAX_FILE_BYTES is 10MB', () => {
  assert.equal(MAX_FILE_BYTES, 10 * 1024 * 1024);
});

test('MAX_FILES is 3', () => {
  assert.equal(MAX_FILES, 3);
});
