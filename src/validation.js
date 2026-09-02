import { buildAssessmentV2, upgradeLegacyAssessment } from '../server/nailoong.mjs';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 3;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isAcceptedFile(file) {
  return Boolean(file && (IMAGE_TYPES.has(file.type) || DOCUMENT_TYPES.has(file.type) || /\.(txt|pdf|docx)$/i.test(file.name)));
}

export function validateFiles(list, { mode = 'chat' } = {}) {
  const files = [...list];
  const limit = mode === 'photo' ? 1 : MAX_FILES;
  if (!files.length) throw new Error('请选择需要鉴定的内容。');
  if (files.length > limit) throw new Error(mode === 'photo' ? '照片鉴定每次只能选择一张图片。' : `聊天记录每次最多选择 ${MAX_FILES} 份文件。`);
  for (const file of files) {
    if (!isAcceptedFile(file) || (mode === 'photo' && !IMAGE_TYPES.has(file.type))) {
      throw new Error(mode === 'photo' ? '照片仅支持 JPG、PNG 或 WebP。' : '仅支持 JPG、PNG、WebP、PDF、TXT 或 DOCX。');
    }
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} 超过 10MB，请压缩后重试。`);
  }
  return files;
}

export function decideFallbackWinner(firstScore, secondScore) {
  const difference = Number(firstScore) - Number(secondScore);
  return Math.abs(difference) <= 2 ? 'tie' : difference > 0 ? 'A' : 'B';
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampScore(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || 0)));
}

export function upgradeClientResult(result) {
  if (!result || result.kind === 'pk') return result;
  return result.schemaVersion === 2 ? structuredClone(result) : upgradeLegacyAssessment(result);
}

export function makeFallbackAssessment(input, mode = 'text', files = []) {
  const raw = mode === 'text'
    ? String(input || '').trim()
    : files.map((file) => `${file.name}-${file.size}`).join('|');
  const seed = hashString(`${mode}:${raw || 'jiahao'}`);
  const jitter = (shift) => ((seed >>> shift) % 21) - 10;
  const has = (pattern) => pattern.test(raw);
  const base = 52 + (seed % 17);
  const dimensions = {
    mystery: clampScore(base + jitter(1) + (has(/无所谓|算了|夜|沉默|随便/) ? 18 : 0)),
    flex: clampScore(base + jitter(3) + (has(/只是|刚好|随手|习惯|不算/) ? 20 : 0)),
    niche: clampScore(base + jitter(5) + (has(/小众|懂的|冷门|主流/) ? 22 : 0)),
    deep: clampScore(base + jitter(7) + (has(/一个人|深夜|没事|想你|累/) ? 24 : 0)),
    show: clampScore(base + jitter(9) + (mode !== 'text' ? 18 : 0)),
    language: clampScore(base + jitter(11) + (has(/底层逻辑|闭环|反正|你们不懂|只是/) ? 24 : 0)),
  };
  const score = clampScore(
    dimensions.mystery * 0.20
      + dimensions.flex * 0.20
      + dimensions.niche * 0.20
      + dimensions.deep * 0.15
      + dimensions.show * 0.15
      + dimensions.language * 0.10,
    8,
    99,
  );
  const top = Object.entries(dimensions).toSorted((a, b) => b[1] - a[1]);
  const type = top[0][0] === 'deep'
    ? '深情破碎豪'
    : top[0][0] === 'niche'
      ? '小众优越豪'
      : top[0][0] === 'flex'
        ? '无意炫耀豪'
        : '潜伏嘉豪';
  const level = score >= 80 ? '豪气冲天' : score >= 60 ? '高阶嘉豪' : score >= 40 ? '半步嘉豪' : '嘉豪观察对象';
  const result = buildAssessmentV2({
    id: `嘉豪-${String(seed).padStart(10, '0').slice(0, 8)}`,
    score,
    level,
    type,
    verdict: score >= 70 ? '你把抽象藏进日常，但每个细节都在替你发言。' : '暂时看起来正常，建议继续观察。',
    dimensions,
    traits: ['表面正常', '细节埋点', '随手发挥', '等待追问'],
    evidence: [
      '表达里出现了明显的信息留白，像是在等待朋友主动追问。',
      '表面语气很平静，细节却偷偷给自己加了一段戏。',
      '正常反应与抽象反应同时出现，现场存在轻微失控可能。',
    ],
    comment: '你嘴上说着随便，细节却一个没迟到。别急着解释，解释就等于给抽象补交书面证明。',
    createdAt: Date.now(),
    mode,
    source: '基础算法成绩',
  }, 'fallback-rules-v1');
  return result;
}

export function makeSocialResultPayload(result) {
  if (!result || result.kind === 'pk') return {};
  const upgraded = upgradeClientResult(result);
  return {
    resultToken: upgraded.resultToken || null,
    result: {
      id: upgraded.id,
      schemaVersion: 2,
      score: upgraded.score,
      level: upgraded.level,
      type: upgraded.type,
      dimensions: upgraded.dimensions,
      nailoong: upgraded.nailoong,
      source: upgraded.source,
    },
  };
}
