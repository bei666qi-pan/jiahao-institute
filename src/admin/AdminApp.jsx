import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { demoCosts, demoOverview, demoRequests, demoStatus, demoVisits } from './demoData.js';
import './admin.css';

const PREVIEW = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1';
const LOGIN_PREVIEW = PREVIEW && new URLSearchParams(window.location.search).get('login') === '1';
const NAV = [
  { id: 'overview', label: '总览', icon: 'home', path: '/admin' },
  { id: 'traffic', label: '访问分析', icon: 'bars', path: '/admin/traffic' },
  { id: 'requests', label: '请求明细', icon: 'list', path: '/admin/requests' },
  { id: 'costs', label: '成本分析', icon: 'cost', path: '/admin/costs' },
  { id: 'status', label: '系统状态', icon: 'pulse', path: '/admin/status' },
];

function currentView() {
  const path = window.location.pathname;
  return NAV.find((item) => item.path === path)?.id || 'overview';
}

function Icon({ name, size = 22 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    home: <><path d="M3 10.8 12 3l9 7.8" /><path d="M5.5 9.5V21h13V9.5M9.2 21v-7h5.6v7" /></>,
    bars: <><path d="M4 20V10h3v10M10.5 20V4h3v16M17 20v-7h3v7" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    cost: <><circle cx="12" cy="12" r="9" /><path d="M8.5 7.5 12 12l3.5-4.5M8.5 13h7M12 12v6" /></>,
    pulse: <path d="M2 12h4l2.2-6 4.1 12 2.2-6H22" />,
    refresh: <><path d="M20 6v5h-5" /><path d="M19 11a7.5 7.5 0 1 0 .1 4" /></>,
    logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10" /></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 6.5a3 3 0 0 1 0 5.5M17 14a5 5 0 0 1 4 5" /></>,
    sessions: <><path d="M4 18V5M4 18h16" /><path d="m6.5 14 4-4 3 2.5L19 7" /></>,
    hourglass: <><path d="M6 3h12M6 21h12M8 3c0 4 1 6 4 9-3 3-4 5-4 9M16 3c0 4-1 6-4 9 3 3 4 5 4 9" /></>,
  };
  return <svg {...common}>{paths[name] || paths.pulse}</svg>;
}

async function api(path, options) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || '请求失败');
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits }).format(Number(value || 0));
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (value >= 3600) return `${formatNumber(value / 3600, 1)}小时`;
  const minutes = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return minutes ? `${minutes}分${rest}秒` : `${rest}秒`;
}

function formatCost(micros) { return `¥${formatNumber(Number(micros || 0) / 1_000_000, 2)}`; }
function formatTime(value, withDate = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', { month: withDate ? '2-digit' : undefined, day: withDate ? '2-digit' : undefined, hour: '2-digit', minute: '2-digit', second: withDate ? '2-digit' : undefined, hour12: false }).format(new Date(value));
}

function Change({ value, inverse = false }) {
  const number = Number(value || 0);
  const good = inverse ? number <= 0 : number >= 0;
  return <span className={good ? 'change good' : 'change bad'}>{number >= 0 ? '↑' : '↓'} {Math.abs(number).toFixed(1)}%</span>;
}

function Metric({ label, value, change, icon, note, inverse = false }) {
  return <div className="metric-item">
    {icon ? <span className="metric-icon"><Icon name={icon} size={38} /></span> : null}
    <div><span className="metric-label">{label}</span><strong>{value}</strong><small>较上期 <Change value={change} inverse={inverse} /></small>{note ? <em>{note}</em> : null}</div>
  </div>;
}

function Empty({ title = '当前周期暂无数据', detail = '新访问和请求出现后会自动更新。' }) {
  return <div className="empty-state"><Icon name="pulse" size={30} /><strong>{title}</strong><span>{detail}</span></div>;
}

function ErrorNotice({ message, onRetry }) {
  return <div className="admin-error" role="alert"><div><strong>数据暂时不可用</strong><span>{message}</span></div>{onRetry ? <button onClick={onRetry}>重试</button> : null}</div>;
}

function TrendChart({ series }) {
  const width = 1400; const height = 200; const pad = { left: 52, right: 58, top: 16, bottom: 30 };
  const max = Math.max(1, ...series.flatMap((item) => [item.visitors, item.sessions]));
  const durationMax = Math.max(60, ...series.map((item) => item.averageActiveSeconds));
  const point = (value, index) => ({
    x: pad.left + (series.length <= 1 ? 0 : index / (series.length - 1)) * (width - pad.left - pad.right),
    y: pad.top + (1 - value / max) * (height - pad.top - pad.bottom),
  });
  const durationPoint = (value, index) => ({
    x: pad.left + (series.length <= 1 ? 0 : index / (series.length - 1)) * (width - pad.left - pad.right),
    y: pad.top + (1 - value / durationMax) * (height - pad.top - pad.bottom),
  });
  const line = (key) => series.map((item, index) => point(item[key], index)).map((item, index) => `${index ? 'L' : 'M'}${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ');
  const durationLine = series.map((item, index) => durationPoint(item.averageActiveSeconds, index)).map((item, index) => `${index ? 'L' : 'M'}${item.x.toFixed(1)},${item.y.toFixed(1)}`).join(' ');
  if (!series.length) return <Empty />;
  return <div className="trend-chart">
    <div className="chart-legend"><span className="visitors">访问人数</span><span className="sessions">访问次数</span><span className="duration">平均访问时长</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="访问人数、访问次数与平均访问时长趋势图">
      {[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={pad.top + ratio * (height - pad.top - pad.bottom)} y2={pad.top + ratio * (height - pad.top - pad.bottom)} className="chart-grid" /><text x="4" y={pad.top + ratio * (height - pad.top - pad.bottom) + 4}>{formatNumber(max * (1 - ratio))}</text></g>)}
      {[0, .5, 1].map((ratio) => <text key={`duration-${ratio}`} x={width - 2} y={pad.top + ratio * (height - pad.top - pad.bottom) + 4} textAnchor="end">{formatNumber(durationMax * (1 - ratio) / 60, 1)}分</text>)}
      <path d={line('visitors')} className="chart-line visitors-line" />
      <path d={line('sessions')} className="chart-line sessions-line" />
      <path d={durationLine} className="chart-line duration-line" />
      {series.map((item, index) => {
        const visitors = point(item.visitors, index); const sessions = point(item.sessions, index); const duration = durationPoint(item.averageActiveSeconds, index);
        return <g key={item.bucket}>
          <circle cx={visitors.x} cy={visitors.y} r="4"><title>{`访问人数 ${formatNumber(item.visitors)}`}</title></circle>
          <circle cx={sessions.x} cy={sessions.y} r="4" className="session-dot"><title>{`访问次数 ${formatNumber(item.sessions)}，平均访问 ${formatDuration(item.averageActiveSeconds)}`}</title></circle>
          <circle cx={duration.x} cy={duration.y} r="4" className="duration-dot"><title>{`平均访问时长 ${formatDuration(item.averageActiveSeconds)}`}</title></circle>
          <text x={visitors.x} y={height - 10} textAnchor="middle">{new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(item.bucket))}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function Login({ onLogin, configured = true }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onLogin(password); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <main className="admin-login">
    <a className="login-brand" href="/"><span className="brand-mark">◇</span>嘉豪观测台</a>
    <form onSubmit={submit} className="login-panel">
      <h1>进入观测台</h1><p>查看流量、稳定性与模型成本</p>
      {!configured ? <div className="config-warning">请先配置 PostgreSQL 与后台访问密码。</div> : null}
      <label htmlFor="admin-password">访问密码</label>
      <div className={error ? 'password-field has-error' : 'password-field'}>
        <input id="admin-password" type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={!configured} />
        <button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? '隐藏密码' : '显示密码'}><Icon name="eye" /></button>
      </div>
      {error ? <span className="login-error" role="alert">{error}</span> : null}
      <button className="login-submit" disabled={busy || !configured}>{busy ? '正在验证…' : '验证并进入'}</button>
      <a className="back-link" href="/">返回嘉豪鉴定所</a>
    </form>
    <span className="login-foot">仅限授权访问</span>
  </main>;
}

function Sidebar({ view, onNavigate, updatedAt }) {
  return <aside className="admin-sidebar">
    <a className="admin-brand" href="/admin">嘉豪观测台</a>
    <nav aria-label="后台导航">{NAV.map((item) => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => onNavigate(item)} aria-current={view === item.id ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
    <span className="sidebar-update"><i />{updatedAt ? `数据更新：${formatTime(updatedAt)}` : '等待数据更新'}</span>
  </aside>;
}

function Topbar({ title, range, onRange, onRefresh, onLogout, busy, headingRef }) {
  return <header className="admin-topbar"><h1 ref={headingRef} tabIndex="-1">{title}</h1><div className="top-actions">
    <button onClick={onRefresh} disabled={busy}><Icon name="refresh" size={19} />刷新</button>
    <span className="top-divider" />
    <button onClick={onLogout}><Icon name="logout" size={19} />退出</button>
  </div><div className="range-switch" aria-label="时间范围">{['24h', '7d', '30d'].map((item) => <button key={item} className={range === item ? 'active' : ''} aria-pressed={range === item} onClick={() => onRange(item)}>{item === '24h' ? '24 小时' : item === '7d' ? '7 天' : '30 天'}</button>)}</div></header>;
}

function Overview({ data }) {
  const t = data.traffic; const a = data.api;
  const funnelLabels = {
    assessment_started: '开始鉴定', assessment_completed: '完成鉴定', share_clicked: '点击分享',
    challenge_created: '创建挑战', challenge_opened: '打开邀请', friend_completed: '好友完成',
    lab_game_started: '实验室开局', lab_game_completed: '实验室完成', room_created: '创建房间', room_joined: '加入房间',
  };
  const insights = data.productInsights || { assessment: data.productFunnel || [], invite: [], games: [], image: {} };
  const gameLabels = { reaction: '奶龙反应局', court: '抽象法庭', image: '角色图片创作', video: '角色视频创作', hao_quote: '嘉豪语录', hao_pk: '双人豪气 PK' };
  const Funnel = ({ title, rows }) => <div className="funnel-path"><h3>{title}</h3>{rows.length ? <div>{rows.map((row, index) => <article key={row.event}><header><span>{funnelLabels[row.event] || row.event}</span><b>{formatNumber(row.visitors)} 人</b></header><i><b style={{ width: `${Math.min(100, index ? (row.conversion ?? 0) : 100)}%` }}/></i><small>{index === 0 ? `${formatNumber(row.events)} 次触发` : row.conversion == null ? '缺少上一步起点' : `上一步转化 ${formatNumber(row.conversion, 1)}%`}</small></article>)}</div> : <Empty />}</div>;
  return <div className="overview-page">
    <section className="primary-metrics" aria-label="重点流量指标">
      <Metric label="访问人数" value={formatNumber(t.visitors.value)} change={t.visitors.change} icon="users" />
      <Metric label="访问次数" value={formatNumber(t.sessions.value)} change={t.sessions.change} icon="sessions" />
      <Metric label="平均访问时长" value={formatDuration(t.averageActiveSeconds.value)} change={t.averageActiveSeconds.change} icon="clock" note="按页面有效活跃时间统计" />
      <Metric label="累计有效停留" value={formatDuration(t.activeSeconds.value)} change={t.activeSeconds.change} icon="hourglass" />
    </section>
    <section className="traffic-panel"><h2>访问趋势</h2><TrendChart series={data.series} />
      <div className="quality-strip">
        <Metric label="页面浏览" value={formatNumber(t.pageViews.value)} change={t.pageViews.change} />
        <Metric label="新访客" value={`${formatNumber(t.newVisitorRate.value, 1)}%`} change={t.newVisitorRate.change} />
        <Metric label="跳出率" value={`${formatNumber(t.bounceRate.value, 1)}%`} change={t.bounceRate.change} inverse />
      </div>
    </section>
    <section className="funnel-panel"><header><div><h2>玩家转化</h2><p>按匿名玩家去重，百分比表示从上一步继续的人。</p></div><span>不记录提交内容</span></header><div className="funnel-grid"><Funnel title="鉴定到分享" rows={insights.assessment || []}/><Funnel title="邀请到好友完成" rows={insights.invite || []}/></div></section>
    <section className="play-metrics"><header><div><h2>玩法表现</h2><p>开局、完成与参与人数分开统计，避免把重复游玩误算成新玩家。</p></div></header><div className="play-metric-grid">{(insights.games || []).map((row) => <article key={row.game}><span>{gameLabels[row.game] || row.game}</span><strong>{row.completionRate == null ? '—' : `${formatNumber(row.completionRate, 1)}%`}</strong><small>{formatNumber(row.completed)} / {formatNumber(row.started)} 局完成 · {formatNumber(row.players)} 人参与</small></article>)}<article className="image-health"><span>图片生成</span><strong>{insights.image?.successRate == null ? '—' : `${formatNumber(insights.image.successRate, 1)}%`}</strong><small>{formatNumber(insights.image?.successes)} / {formatNumber(insights.image?.requests)} 张成功 · P95 {formatNumber((insights.image?.p95Ms || 0) / 1000, 1)} 秒</small></article>{(insights.video || []).map((row) => <article className="image-health" key={row.character}><span>{row.character === 'jiahao' ? '嘉豪' : '奶龙'}视频</span><strong>{row.successRate == null ? '—' : `${formatNumber(row.successRate, 1)}%`}</strong><small>{formatNumber(row.successes)} / {formatNumber(row.requests)} 条成功 · P95 {formatNumber((row.p95Ms || 0) / 1000, 1)} 秒</small></article>)}</div>{insights.games?.length || insights.image?.requests || insights.video?.length ? null : <Empty title="暂时还没有玩法数据" detail="用户完成玩法后会自动出现。"/>}</section>
    <section className="data-table-wrap wide"><h2>最新意见反馈</h2>{data.feedback?.length ? <table><thead><tr><th>时间</th><th>类型</th><th>内容</th><th>联系方式</th></tr></thead><tbody>{data.feedback.map((row) => <tr key={row.feedback_id}><td>{formatTime(row.created_at, true)}</td><td>{row.category}</td><td>{row.message}</td><td>{row.contact || '—'}</td></tr>)}</tbody></table> : <Empty title="暂无意见反馈" detail="用户从首页提交后会出现在这里。"/>}</section>
    <section className="api-panel"><h2>接口与模型成本</h2>
      <div className="api-metrics">
        <Metric label="API 请求" value={formatNumber(a.requests.value)} change={a.requests.change} />
        <Metric label="成功率" value={`${formatNumber(a.successRate.value, 1)}%`} change={a.successRate.change} />
        <Metric label="平均响应" value={`${formatNumber(a.averageLatencyMs.value / 1000, 1)}s`} change={a.averageLatencyMs.change} inverse />
        <Metric label="预估成本" value={formatCost(a.estimatedCostMicros.value)} change={a.estimatedCostMicros.change} />
      </div>
      {a.costCoverage < 100 ? <div className="coverage-warning">成本覆盖率 {formatNumber(a.costCoverage, 1)}%，未配置单价或缺少 usage 的请求未计入金额。</div> : null}
      <div className="api-detail-grid"><EndpointTable rows={data.endpoints} /><ErrorRail rows={data.recentErrors} /></div>
    </section>
  </div>;
}

function EndpointTable({ rows }) {
  const [sort, setSort] = useState({ key: 'requests', direction: 'desc' });
  const sorted = useMemo(() => [...rows].sort((left, right) => {
    const leftValue = sort.key === 'endpoint' ? left.endpoint : Number(left[sort.key] || 0);
    const rightValue = sort.key === 'endpoint' ? right.endpoint : Number(right[sort.key] || 0);
    const compared = typeof leftValue === 'string' ? leftValue.localeCompare(rightValue) : leftValue - rightValue;
    return sort.direction === 'asc' ? compared : -compared;
  }), [rows, sort]);
  const columns = [
    ['endpoint', '接口'], ['requests', '请求数'], ['successRate', '成功率'], ['p95Ms', 'P95'], ['estimatedCostMicros', '预估成本'],
  ];
  const changeSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc' }));
  return <div className="data-table-wrap"><h3>接口表现</h3>{rows.length ? <table><thead><tr>{columns.map(([key, label]) => <th key={key}><button onClick={() => changeSort(key)} aria-label={`${label}，${sort.key === key ? (sort.direction === 'asc' ? '升序' : '降序') : '点击排序'}`}>{label}<span aria-hidden="true">{sort.key === key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span></button></th>)}</tr></thead><tbody>{sorted.map((row) => <tr key={row.endpoint}><td><code>{row.endpoint}</code></td><td>{formatNumber(row.requests)}</td><td className={row.successRate >= 98 ? 'success' : 'warning'}>{formatNumber(row.successRate, 1)}%</td><td>{formatNumber(row.p95Ms)}ms</td><td>{formatCost(row.estimatedCostMicros)}</td></tr>)}</tbody></table> : <Empty />}</div>;
}

function ErrorRail({ rows }) {
  return <div className="error-rail"><h3>近期异常 <small>最近 5 条</small></h3>{rows.length ? <ul>{rows.map((row, index) => <li key={`${row.occurred_at}-${index}`}><i /><code>{row.endpoint}</code><span>{row.status_code} {row.error_message || row.error_code || '请求失败'}</span><time>{formatTime(row.occurred_at, true)}</time></li>)}</ul> : <Empty title="当前周期无异常" detail="接口运行稳定。" />}</div>;
}

function TrafficPage({ overview, visits }) {
  return <div className="detail-page"><section className="detail-summary"><Metric label="访问人数" value={formatNumber(overview.traffic.visitors.value)} change={overview.traffic.visitors.change} /><Metric label="访问次数" value={formatNumber(overview.traffic.sessions.value)} change={overview.traffic.sessions.change} /><Metric label="平均有效停留" value={formatDuration(overview.traffic.averageActiveSeconds.value)} change={overview.traffic.averageActiveSeconds.change} /><Metric label="页面浏览" value={formatNumber(overview.traffic.pageViews.value)} change={overview.traffic.pageViews.change} /></section>
    <section className="traffic-panel detail-chart"><h2>访问质量趋势</h2><TrendChart series={overview.series} /></section>
    <section className="data-table-wrap wide"><h2>最近访问会话</h2>{visits.rows.length ? <table><thead><tr><th>开始时间</th><th>匿名会话</th><th>有效停留</th><th>浏览</th><th>鉴定请求</th><th>来源</th><th>设备</th></tr></thead><tbody>{visits.rows.map((row) => <tr key={row.session_id}><td>{formatTime(row.started_at, true)}</td><td><code>{String(row.session_id).slice(0, 8)}••••</code></td><td>{formatDuration(row.active_seconds)}</td><td>{row.page_views}</td><td>{row.api_requests}</td><td>{row.referrer_host || '直接访问'}</td><td>{row.device_category}</td></tr>)}</tbody></table> : <Empty />}</section>
  </div>;
}

function RequestsPage({ data, filters, onFilters, onMore }) {
  return <div className="detail-page"><div className="filter-bar"><label>接口<select value={filters.endpoint} onChange={(event) => onFilters({ ...filters, endpoint: event.target.value })}><option value="">全部接口</option><option>/api/analyze</option><option>/api/images/generate</option><option>/api/court</option><option>/api/pk</option><option>/api/quote</option></select></label><label>状态<select value={filters.status} onChange={(event) => onFilters({ ...filters, status: event.target.value })}><option value="">全部状态</option><option value="success">成功</option><option value="error">异常</option></select></label></div>
    <section className="data-table-wrap wide"><h2>请求明细</h2>{data.rows.length ? <><table><thead><tr><th>时间</th><th>接口</th><th>模式</th><th>供应商 / 模型</th><th>状态</th><th>响应</th><th>Token</th><th>预估成本</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.request_id}><td>{formatTime(row.occurred_at, true)}</td><td><code>{row.endpoint}</code></td><td>{row.mode || '—'}</td><td>{row.provider || '—'}<small>{row.model}</small></td><td className={row.ok ? 'success' : 'danger'}>{row.status_code}</td><td>{formatNumber(row.latency_ms)}ms</td><td>{row.input_tokens == null ? '—' : `${formatNumber(row.input_tokens)} / ${formatNumber(row.output_tokens)}`}</td><td>{row.pricing_configured ? formatCost(row.estimated_cost_micros) : '未计价'}</td></tr>)}</tbody></table>{data.nextCursor ? <button className="load-more" onClick={onMore}>加载更早请求</button> : null}</> : <Empty />}</section>
  </div>;
}

function CostsPage({ data }) {
  const providers = Array.isArray(data.byProvider) ? data.byProvider : [];
  const days = Array.isArray(data.byDay) ? data.byDay : [];
  const summaryRows = providers.length ? providers : days;
  const total = summaryRows.reduce((sum, row) => sum + Number(row.estimated_cost_micros || row.estimatedCostMicros || 0), 0);
  const pricedRequests = summaryRows.reduce((sum, row) => sum + Number(row.priced_requests || row.pricedRequests || 0), 0);
  const input = summaryRows.reduce((sum, row) => sum + Number(row.input_tokens || 0), 0);
  const output = summaryRows.reduce((sum, row) => sum + Number(row.output_tokens || 0), 0);
  return <div className="detail-page">{data.partial ? <div className="coverage-warning" role="status">部分统计维度暂时未返回，已展示可用的成本数据；刷新后会自动重试。</div> : null}<section className="detail-summary"><Metric label="预估总成本" value={formatCost(total)} change={0} /><Metric label="已计价请求" value={formatNumber(pricedRequests)} change={0} /><Metric label="输入 Token" value={formatNumber(input)} change={0} /><Metric label="输出 Token" value={formatNumber(output)} change={0} /></section>
    <section className="cost-layout"><div className="data-table-wrap"><h2>模型供应商成本</h2>{providers.length ? <table><thead><tr><th>供应商 / 模型</th><th>请求</th><th>输入</th><th>输出</th><th>缓存输入</th><th>预估成本</th></tr></thead><tbody>{providers.map((row) => <tr key={`${row.provider}-${row.model}`}><td>{row.provider}<small>{row.model}</small></td><td>{formatNumber(row.requests)}</td><td>{formatNumber(row.input_tokens)}</td><td>{formatNumber(row.output_tokens)}</td><td>{formatNumber(row.cached_input_tokens)}</td><td>{formatCost(row.estimated_cost_micros || row.estimatedCostMicros)}</td></tr>)}</tbody></table> : <Empty title={data.partial ? '供应商明细暂未返回' : undefined} detail={data.partial ? '总量数据仍可查看，请稍后刷新明细。' : undefined} />}</div><div className="provider-bars"><h2>成本占比</h2>{providers.map((row) => { const cost = Number(row.estimated_cost_micros || row.estimatedCostMicros || 0); return <div key={`${row.provider}-${row.model}`}><span>{row.provider}<small>{row.model}</small></span><strong>{formatCost(cost)}</strong><i><b style={{ width: `${total ? cost / total * 100 : 0}%` }} /></i></div>; })}</div></section>
  </div>;
}

function StatusPage({ data }) {
  const items = [
    ['PostgreSQL', data.databaseHealthy, data.databaseConfigured ? '连接正常' : '尚未配置'],
    ['文字模型', data.textModelConfigured, data.textModel || '尚未配置'],
    ['多模态模型', data.visionModelConfigured, data.visionModel || '尚未配置'],
    ['后台访问密码', data.adminPasswordConfigured, data.adminPasswordConfigured ? '已安全配置' : '尚未配置'],
  ];
  return <div className="detail-page"><section className="status-grid">{items.map(([name, ok, detail]) => <div key={name}><i className={ok ? 'ok' : 'bad'} /><span>{name}</span><strong>{ok ? '正常' : '需要处理'}</strong><small>{detail}</small></div>)}</section><section className="status-facts"><h2>观测运行信息</h2><dl><div><dt>明细保留</dt><dd>{data.retentionDays} 天</dd></div><div><dt>服务运行时间</dt><dd>{formatDuration(data.uptimeSeconds)}</dd></div><div><dt>最近数据库写入</dt><dd>{formatTime(data.lastDatabaseSuccessAt, true)}</dd></div><div><dt>丢弃观测写入</dt><dd className={data.droppedWrites ? 'danger' : ''}>{formatNumber(data.droppedWrites)}</dd></div><div><dt>最近数据库错误</dt><dd>{data.lastDatabaseError || '无'}</dd></div></dl></section></div>;
}

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(PREVIEW ? !LOGIN_PREVIEW : null);
  const [configured, setConfigured] = useState(true);
  const [view, setView] = useState(currentView);
  const [range, setRange] = useState('7d');
  const [data, setData] = useState(null);
  const [extra, setExtra] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ endpoint: '', status: '' });
  const headingRef = useRef(null);

  useEffect(() => {
    if (PREVIEW) return;
    api('/api/admin/session').then((result) => { setAuthenticated(result.authenticated); setConfigured(result.configured); }).catch(() => { setAuthenticated(false); setConfigured(false); });
  }, []);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setBusy(true); setError('');
    try {
      if (PREVIEW) {
        const map = { overview: demoOverview, traffic: demoOverview, requests: demoRequests, costs: demoCosts, status: demoStatus };
        setData(map[view]); setExtra(view === 'traffic' ? demoVisits : null); return;
      }
      if (view === 'overview') setData(await api(`/api/admin/overview?range=${range}`));
      if (view === 'traffic') {
        const [overview, visits] = await Promise.all([api(`/api/admin/overview?range=${range}`), api(`/api/admin/visits?range=${range}`)]);
        setData(overview); setExtra(visits);
      }
      if (view === 'requests') {
        const query = new URLSearchParams({ range, ...(filters.endpoint ? { endpoint: filters.endpoint } : {}), ...(filters.status ? { status: filters.status } : {}) });
        setData(await api(`/api/admin/requests?${query}`));
      }
      if (view === 'costs') setData(await api(`/api/admin/costs?range=${range}`));
      if (view === 'status') setData(await api('/api/admin/status'));
    } catch (err) {
      if (err.status === 401) setAuthenticated(false);
      else setError(err.message);
    } finally { setBusy(false); }
  }, [authenticated, filters.endpoint, filters.status, range, view]);

  useEffect(() => { void load(); }, [load]);

  const navigate = (item) => { window.history.pushState({}, '', item.path); setView(item.id); setData(null); setExtra(null); window.requestAnimationFrame(() => headingRef.current?.focus()); };
  useEffect(() => { const onPop = () => setView(currentView()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop); }, []);
  const login = async (password) => {
    if (PREVIEW) { setAuthenticated(Boolean(password)); return; }
    const result = await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    setAuthenticated(result.authenticated);
  };
  const logout = async () => { if (!PREVIEW) await api('/api/admin/logout', { method: 'POST' }); setAuthenticated(false); setData(null); };
  const loadMore = async () => {
    if (!data?.nextCursor || PREVIEW) return;
    const query = new URLSearchParams({ range, cursor: data.nextCursor, ...(filters.endpoint ? { endpoint: filters.endpoint } : {}), ...(filters.status ? { status: filters.status } : {}) });
    const next = await api(`/api/admin/requests?${query}`);
    setData((current) => ({ rows: [...current.rows, ...next.rows], nextCursor: next.nextCursor }));
  };
  const title = useMemo(() => ({ overview: '访问总览', traffic: '访问分析', requests: '请求明细', costs: '成本分析', status: '系统状态' })[view], [view]);

  if (authenticated === null) return <div className="admin-boot">正在验证访问权限…</div>;
  if (!authenticated) return <Login onLogin={login} configured={configured} />;
  return <div className="admin-shell"><Sidebar view={view} onNavigate={navigate} updatedAt={data?.generatedAt} /><main className="admin-main"><Topbar title={title} range={range} onRange={setRange} onRefresh={load} onLogout={logout} busy={busy} headingRef={headingRef} />
    <div className={busy && !data ? 'admin-content loading' : 'admin-content'} aria-busy={busy}>{error ? <ErrorNotice message={error} onRetry={load} /> : null}{!data && !error ? <div className="admin-loading" role="status">正在汇总观测数据…</div> : null}{data && view === 'overview' ? <Overview data={data} /> : null}{data && view === 'traffic' && extra ? <TrafficPage overview={data} visits={extra} /> : null}{data && view === 'requests' ? <RequestsPage data={data} filters={filters} onFilters={setFilters} onMore={loadMore} /> : null}{data && view === 'costs' ? <CostsPage data={data} /> : null}{data && view === 'status' ? <StatusPage data={data} /> : null}</div>
  </main></div>;
}
