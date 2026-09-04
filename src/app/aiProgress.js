const PROFILES = {
  analysis: 15_000,
  quote: 10_000,
  duel: 16_000,
  image: 65_000,
  video: 90_000,
};

function runningValue(elapsedMs, expectedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const expected = PROFILES[expectedMs] || expectedMs || PROFILES.analysis;
  return Math.min(90, 18 + Math.round(72 * (1 - Math.exp(-elapsed / expected))));
}

export function getAiProgress({ kind = 'analysis', status = 'running', startedAt = Date.now(), now = Date.now() } = {}) {
  if (status === 'submitting') return { value: 8, stage: '正在提交给 AI', detail: '预计进度，会随等待时间缓慢推进', estimated: true };
  if (status === 'queued') return { value: 14, stage: '任务已进入供应商队列', detail: '队列状态已确认；百分比为预计进度', estimated: true };
  if (status === 'finalizing') return { value: 96, stage: '正在整理生成结果', detail: '收尾阶段已确认；百分比为预计进度', estimated: true };
  if (status === 'succeeded') return { value: 100, stage: '生成完成', detail: '生成结果已就绪', estimated: false };
  return {
    value: runningValue(now - (Number.isFinite(Number(startedAt)) ? Number(startedAt) : now), PROFILES[kind] || PROFILES.analysis),
    stage: kind === 'analysis' ? 'AI 正在分析' : kind === 'quote' ? 'AI 正在组织表达' : kind === 'image' ? 'AI 正在绘制画面' : kind === 'video' ? 'AI 正在生成动态画面' : 'AI 正在裁决',
    detail: '预计进度，会随等待时间缓慢推进',
    estimated: true,
  };
}
