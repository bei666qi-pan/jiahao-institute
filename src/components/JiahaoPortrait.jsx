const PORTRAIT_SHEETS = [
  '/assets/jiahao-species-labs.png',
  '/assets/jiahao-species-blue.png',
];

export function JiahaoPortrait({ variant = 0, label = '嘉豪人物状态', className = '' }) {
  const safeVariant = Math.abs(Number(variant) || 0) % 6;
  const sheet = PORTRAIT_SHEETS[Math.floor(safeVariant / 3)];
  const frame = safeVariant % 3;
  return <span
    className={`jiahao-portrait ${className}`.trim()}
    role="img"
    aria-label={label}
    style={{ '--jiahao-sheet': `url("${sheet}")`, '--jiahao-position': `${frame * 50}%` }}
  />;
}
