import { useEffect, useState } from 'react';
import { getAiProgress } from '../app/aiProgress';

const ACTIVE = new Set(['submitting', 'queued', 'running', 'finalizing']);

export function AiProgress({ label, kind = 'analysis', status = 'running', startedAt = Date.now(), compact = false }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ACTIVE.has(status)) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [status, startedAt]);

  const progress = getAiProgress({ kind, status, startedAt, now });
  return <div className={`ai-progress ${compact ? 'compact' : ''}`} data-kind={kind} data-status={status}>
    <div className="ai-progress-copy"><span aria-live="polite">{progress.stage}</span><strong>{progress.estimated ? `预计 ${progress.value}%` : '已完成'}</strong></div>
    <div className="ai-progress-track" role="progressbar" aria-label={`${label}预计进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.value} aria-valuetext={`${progress.detail}，${progress.value}%`}>
      <i style={{ width: `${progress.value}%` }}/>
    </div>
    {!compact ? <small>{progress.detail}</small> : null}
  </div>;
}
