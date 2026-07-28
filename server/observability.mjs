import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const SESSION_MAX_AGE_SECONDS = 30 * 60;
const VISITOR_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOT_RE = /bot|crawler|spider|slurp|headless|lighthouse|monitoring|uptime|preview/i;

const RANGE_OPTIONS = {
  '24h': { milliseconds: 24 * 60 * 60 * 1000, bucket: 'hour' },
  '7d': { milliseconds: 7 * 24 * 60 * 60 * 1000, bucket: 'day' },
  '30d': { milliseconds: 30 * 24 * 60 * 60 * 1000, bucket: 'day' },
};

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function integerOrNull(value) {
  const number = finiteNonNegative(value);
  return number === null ? null : Math.round(number);
}

export function parseUsage(usage) {
  if (!usage || typeof usage !== 'object') return { inputTokens: null, outputTokens: null, cachedInputTokens: null };
  const inputTokens = integerOrNull(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = integerOrNull(usage.completion_tokens ?? usage.output_tokens);
  const cachedInputTokens = integerOrNull(
    usage.prompt_cache_hit_tokens
      ?? usage.prompt_tokens_details?.cached_tokens
      ?? usage.input_tokens_details?.cached_tokens,
  );
  return { inputTokens, outputTokens, cachedInputTokens };
}

export function calculateEstimatedCost(usage, prices = {}) {
  const tokens = parseUsage(usage);
  const inputRate = finiteNonNegative(prices.input);
  const outputRate = finiteNonNegative(prices.output);
  const cachedRate = finiteNonNegative(prices.cachedInput);
  if (tokens.inputTokens === null || tokens.outputTokens === null || inputRate === null || outputRate === null) {
    return { ...tokens, estimatedCostMicros: null, pricingConfigured: false };
  }
  const cached = Math.min(tokens.cachedInputTokens || 0, tokens.inputTokens);
  if (cached > 0 && cachedRate === null) return { ...tokens, estimatedCostMicros: null, pricingConfigured: false };
  const uncached = tokens.inputTokens - cached;
  // 单价是人民币/百万 token；乘以人民币微元后，百万因子正好抵消。
  const estimatedCostMicros = Math.round(uncached * inputRate + cached * (cachedRate ?? inputRate) + tokens.outputTokens * outputRate);
  return { ...tokens, estimatedCostMicros, pricingConfigured: true };
}

export function activeDeltaSeconds(previous, current) {
  const delta = (new Date(current).getTime() - new Date(previous).getTime()) / 1000;
  return Number.isFinite(delta) ? Math.max(0, Math.min(30, Math.floor(delta))) : 0;
}

export function getRangeConfig(value, now = new Date()) {
  const key = RANGE_OPTIONS[value] ? value : '7d';
  const option = RANGE_OPTIONS[key];
  const end = new Date(now);
  const start = new Date(end.getTime() - option.milliseconds);
  const previousStart = new Date(start.getTime() - option.milliseconds);
  return { key, bucket: option.bucket, start, end, previousStart };
}

export function encodeCursor(values) {
  return Buffer.from(JSON.stringify(values), 'utf8').toString('base64url');
}

export function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return Array.isArray(parsed) && parsed.length === 2 ? parsed : null;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function cookie(name, value, maxAge, req, sameSite = 'Lax') {
  const secure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}${secure ? '; Secure' : ''}`;
}

function cleanPath(value) {
  const path = typeof value === 'string' ? value.trim().slice(0, 300) : '/';
  return path.startsWith('/') && !path.startsWith('/admin') ? path : '/';
}

function referrerHost(value) {
  if (!value || typeof value !== 'string') return null;
  try { return new URL(value).hostname.slice(0, 200); } catch { return null; }
}

function deviceCategory(userAgent = '') {
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  if (/mobile|android|iphone/i.test(userAgent)) return 'mobile';
  return 'desktop';
}

function number(value) {
  return Number(value || 0);
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function metric(value, previous) {
  const currentNumber = number(value);
  const previousNumber = number(previous);
  return { value: currentNumber, previous: previousNumber, change: percentChange(currentNumber, previousNumber) };
}

export class Observability {
  constructor(env = process.env) {
    this.databaseUrl = env.DATABASE_URL || '';
    this.enabled = Boolean(this.databaseUrl);
    this.retentionDays = Math.max(1, Number(env.METRICS_RETENTION_DAYS || 90));
    this.lastError = null;
    this.lastSuccessAt = null;
    this.droppedWrites = 0;
    this.startedAt = new Date();
    this.pool = this.enabled ? new Pool({
      connectionString: this.databaseUrl,
      max: Math.max(1, Number(env.DATABASE_POOL_MAX || 10)),
      idleTimeoutMillis: Math.max(1000, Number(env.DATABASE_IDLE_TIMEOUT_MS || 30_000)),
      connectionTimeoutMillis: Math.max(1000, Number(env.DATABASE_CONNECT_TIMEOUT_MS || 5_000)),
      ssl: env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' },
    }) : null;
  }

  async query(text, params = []) {
    if (!this.pool) throw new Error('观测数据库尚未配置');
    try {
      const result = await this.pool.query(text, params);
      this.lastSuccessAt = new Date();
      this.lastError = null;
      return result;
    } catch (error) {
      this.lastError = String(error?.message || '数据库请求失败').slice(0, 160);
      throw error;
    }
  }

  async init() {
    if (!this.enabled) return false;
    const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));
    const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
    await this.query('create table if not exists jh_schema_migrations (version text primary key, applied_at timestamptz not null default now())');
    for (const file of files) {
      const applied = await this.query('select 1 from jh_schema_migrations where version = $1', [file]);
      if (applied.rowCount) continue;
      const client = await this.pool.connect();
      try {
        await client.query('begin');
        await client.query(await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8'));
        await client.query('insert into jh_schema_migrations (version) values ($1) on conflict do nothing', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally { client.release(); }
    }
    return true;
  }

  async recordSession(req, payload = {}) {
    if (!this.enabled || BOT_RE.test(req.headers['user-agent'] || '')) return { ignored: true };
    const cookies = parseCookies(req);
    const visitorId = UUID_RE.test(cookies.jh_vid || '') ? cookies.jh_vid : randomUUID();
    let sessionId = UUID_RE.test(cookies.jh_sid || '') ? cookies.jh_sid : null;
    const path = cleanPath(payload.path);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(`insert into jh_visitors (visitor_id) values ($1)
        on conflict (visitor_id) do update set last_seen = now()`, [visitorId]);
      if (sessionId) {
        const existing = await client.query(`update jh_sessions set last_seen_at = now(), page_views = page_views + 1
          where session_id = $1 and visitor_id = $2 and last_seen_at > now() - interval '30 minutes'
          returning session_id`, [sessionId, visitorId]);
        if (!existing.rowCount) sessionId = null;
      }
      if (!sessionId) {
        sessionId = randomUUID();
        await client.query(`insert into jh_sessions
          (session_id, visitor_id, page_views, landing_path, referrer_host, device_category)
          values ($1, $2, 1, $3, $4, $5)`, [sessionId, visitorId, path, referrerHost(payload.referrer), deviceCategory(req.headers['user-agent'])]);
      }
      await client.query('insert into jh_page_views (visitor_id, session_id, path) values ($1, $2, $3)', [visitorId, sessionId, path]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
    return {
      visitorId,
      sessionId,
      cookies: [cookie('jh_vid', visitorId, VISITOR_MAX_AGE_SECONDS, req), cookie('jh_sid', sessionId, SESSION_MAX_AGE_SECONDS, req)],
    };
  }

  async heartbeat(req) {
    if (!this.enabled || BOT_RE.test(req.headers['user-agent'] || '')) return false;
    const sessionId = parseCookies(req).jh_sid;
    if (!UUID_RE.test(sessionId || '')) return false;
    const result = await this.query(`update jh_sessions set
      active_seconds = active_seconds + least(30, greatest(0, floor(extract(epoch from (now() - last_heartbeat_at)))::integer)),
      last_heartbeat_at = now(), last_seen_at = now()
      where session_id = $1 and last_seen_at > now() - interval '30 minutes'`, [sessionId]);
    return result.rowCount > 0;
  }

  async recordApiRequest(req, event) {
    if (!this.enabled) return;
    const cookies = parseCookies(req);
    const visitorId = UUID_RE.test(cookies.jh_vid || '') ? cookies.jh_vid : null;
    const sessionId = UUID_RE.test(cookies.jh_sid || '') ? cookies.jh_sid : null;
    try {
      await this.query(`insert into jh_api_requests
        (request_id, visitor_id, session_id, endpoint, mode, provider, model, status_code, ok, latency_ms,
         input_tokens, output_tokens, cached_input_tokens, estimated_cost_micros, pricing_configured, error_code, error_message)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [
        event.requestId, visitorId, sessionId, event.endpoint, event.mode || null, event.provider || null, event.model || null,
        event.statusCode, event.ok, Math.max(0, Math.round(event.latencyMs)), event.inputTokens ?? null, event.outputTokens ?? null,
        event.cachedInputTokens ?? null, event.estimatedCostMicros ?? null, Boolean(event.pricingConfigured),
        event.errorCode || null, event.errorMessage ? String(event.errorMessage).slice(0, 160) : null,
      ]);
      if (sessionId) await this.query('update jh_sessions set api_requests = api_requests + 1, last_seen_at = now() where session_id = $1', [sessionId]);
    } catch {
      this.droppedWrites += 1;
    }
  }

  async overview(rangeValue) {
    const range = getRangeConfig(rangeValue);
    const bucket = range.bucket;
    const trafficSql = `select count(distinct s.visitor_id)::bigint visitors, count(*)::bigint sessions,
      coalesce(sum(s.page_views),0)::bigint page_views, coalesce(sum(s.active_seconds),0)::bigint active_seconds,
      count(*) filter (where s.active_seconds < 10 and s.api_requests = 0)::bigint bounced_sessions,
      count(distinct s.visitor_id) filter (where v.first_seen >= $1 and v.first_seen < $2)::bigint new_visitors
      from jh_sessions s join jh_visitors v on v.visitor_id = s.visitor_id
      where s.started_at >= $1 and s.started_at < $2`;
    const apiSql = `select count(*)::bigint requests, count(*) filter (where ok)::bigint successes,
      coalesce(avg(latency_ms),0)::numeric average_latency_ms,
      coalesce(sum(estimated_cost_micros),0)::bigint estimated_cost_micros,
      count(*) filter (where pricing_configured)::bigint priced_requests
      from jh_api_requests where occurred_at >= $1 and occurred_at < $2`;
    const [currentTraffic, previousTraffic, currentApi, previousApi, trafficSeries, apiSeries, providers, endpoints, errors] = await Promise.all([
      this.query(trafficSql, [range.start, range.end]),
      this.query(trafficSql, [range.previousStart, range.start]),
      this.query(apiSql, [range.start, range.end]),
      this.query(apiSql, [range.previousStart, range.start]),
      this.query(`select date_trunc('${bucket}', started_at at time zone '${SHANGHAI_TIME_ZONE}') bucket,
        count(distinct visitor_id)::bigint visitors, count(*)::bigint sessions,
        coalesce(avg(active_seconds),0)::numeric average_active_seconds
        from jh_sessions where started_at >= $1 and started_at < $2 group by 1 order by 1`, [range.start, range.end]),
      this.query(`select date_trunc('${bucket}', occurred_at at time zone '${SHANGHAI_TIME_ZONE}') bucket,
        count(*)::bigint requests, coalesce(sum(estimated_cost_micros),0)::bigint cost_micros
        from jh_api_requests where occurred_at >= $1 and occurred_at < $2 group by 1 order by 1`, [range.start, range.end]),
      this.query(`select coalesce(provider,'unknown') provider, coalesce(model,'unknown') model, count(*)::bigint requests,
        coalesce(sum(estimated_cost_micros),0)::bigint estimated_cost_micros,
        count(*) filter (where pricing_configured)::bigint priced_requests
        from jh_api_requests where occurred_at >= $1 and occurred_at < $2 group by 1,2 order by estimated_cost_micros desc`, [range.start, range.end]),
      this.query(`select endpoint, count(*)::bigint requests, count(*) filter (where ok)::bigint successes,
        coalesce(percentile_cont(.95) within group (order by latency_ms),0)::numeric p95_ms,
        coalesce(sum(estimated_cost_micros),0)::bigint estimated_cost_micros
        from jh_api_requests where occurred_at >= $1 and occurred_at < $2 group by endpoint order by requests desc`, [range.start, range.end]),
      this.query(`select endpoint, status_code, error_code, error_message, occurred_at
        from jh_api_requests where ok = false and occurred_at >= $1 and occurred_at < $2
        order by occurred_at desc limit 5`, [range.start, range.end]),
    ]);
    const t = currentTraffic.rows[0]; const pt = previousTraffic.rows[0];
    const a = currentApi.rows[0]; const pa = previousApi.rows[0];
    const avgActive = number(t.active_seconds) / Math.max(1, number(t.sessions));
    const prevAvgActive = number(pt.active_seconds) / Math.max(1, number(pt.sessions));
    const successRate = number(a.successes) / Math.max(1, number(a.requests)) * 100;
    const prevSuccessRate = number(pa.successes) / Math.max(1, number(pa.requests)) * 100;
    return {
      range: range.key,
      generatedAt: new Date().toISOString(),
      traffic: {
        visitors: metric(t.visitors, pt.visitors), sessions: metric(t.sessions, pt.sessions),
        averageActiveSeconds: metric(avgActive, prevAvgActive), activeSeconds: metric(t.active_seconds, pt.active_seconds),
        pageViews: metric(t.page_views, pt.page_views),
        newVisitorRate: metric(number(t.new_visitors) / Math.max(1, number(t.visitors)) * 100, number(pt.new_visitors) / Math.max(1, number(pt.visitors)) * 100),
        bounceRate: metric(number(t.bounced_sessions) / Math.max(1, number(t.sessions)) * 100, number(pt.bounced_sessions) / Math.max(1, number(pt.sessions)) * 100),
      },
      api: {
        requests: metric(a.requests, pa.requests), successRate: metric(successRate, prevSuccessRate),
        averageLatencyMs: metric(a.average_latency_ms, pa.average_latency_ms),
        estimatedCostMicros: metric(a.estimated_cost_micros, pa.estimated_cost_micros),
        costCoverage: number(a.priced_requests) / Math.max(1, number(a.requests)) * 100,
      },
      series: trafficSeries.rows.map((row) => ({ bucket: row.bucket, visitors: number(row.visitors), sessions: number(row.sessions), averageActiveSeconds: number(row.average_active_seconds) })),
      apiSeries: apiSeries.rows.map((row) => ({ bucket: row.bucket, requests: number(row.requests), costMicros: number(row.cost_micros) })),
      providers: providers.rows.map((row) => ({ ...row, requests: number(row.requests), estimatedCostMicros: number(row.estimated_cost_micros), pricedRequests: number(row.priced_requests) })),
      endpoints: endpoints.rows.map((row) => ({ endpoint: row.endpoint, requests: number(row.requests), successRate: number(row.successes) / Math.max(1, number(row.requests)) * 100, p95Ms: number(row.p95_ms), estimatedCostMicros: number(row.estimated_cost_micros) })),
      recentErrors: errors.rows,
    };
  }

  async visits(rangeValue, cursorValue, limitValue = 30) {
    const range = getRangeConfig(rangeValue);
    const cursor = decodeCursor(cursorValue);
    const limit = Math.min(100, Math.max(1, Number(limitValue) || 30));
    const params = [range.start, range.end];
    let cursorSql = '';
    if (cursor) { params.push(new Date(cursor[0]), cursor[1]); cursorSql = `and (started_at, session_id) < ($3, $4::uuid)`; }
    params.push(limit + 1);
    const result = await this.query(`select session_id, started_at, last_seen_at, active_seconds, page_views, api_requests,
      landing_path, referrer_host, device_category from jh_sessions
      where started_at >= $1 and started_at < $2 ${cursorSql}
      order by started_at desc, session_id desc limit $${params.length}`, params);
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return { rows, nextCursor: hasMore && last ? encodeCursor([last.started_at, last.session_id]) : null };
  }

  async requests(rangeValue, cursorValue, filters = {}) {
    const range = getRangeConfig(rangeValue);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 30));
    const params = [range.start, range.end];
    const where = ['occurred_at >= $1', 'occurred_at < $2'];
    if (filters.endpoint) { params.push(String(filters.endpoint).slice(0, 80)); where.push(`endpoint = $${params.length}`); }
    if (filters.status === 'success') where.push('ok = true');
    if (filters.status === 'error') where.push('ok = false');
    const cursor = decodeCursor(cursorValue);
    if (cursor) { params.push(new Date(cursor[0]), String(cursor[1])); where.push(`(occurred_at, id) < ($${params.length - 1}, $${params.length})`); }
    params.push(limit + 1);
    const result = await this.query(`select id, request_id, endpoint, mode, provider, model, status_code, ok, latency_ms,
      input_tokens, output_tokens, cached_input_tokens, estimated_cost_micros, pricing_configured, error_code, error_message, occurred_at
      from jh_api_requests where ${where.join(' and ')} order by occurred_at desc, id desc limit $${params.length}`, params);
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return { rows, nextCursor: hasMore && last ? encodeCursor([last.occurred_at, last.id]) : null };
  }

  async costs(rangeValue) {
    const range = getRangeConfig(rangeValue);
    const results = await Promise.allSettled([
      this.query(`select (occurred_at at time zone '${SHANGHAI_TIME_ZONE}')::date day,
        coalesce(sum(input_tokens),0)::bigint input_tokens, coalesce(sum(output_tokens),0)::bigint output_tokens,
        coalesce(sum(cached_input_tokens),0)::bigint cached_input_tokens, coalesce(sum(estimated_cost_micros),0)::bigint estimated_cost_micros,
        count(*)::bigint requests, count(*) filter (where pricing_configured)::bigint priced_requests
        from jh_api_requests where occurred_at >= $1 and occurred_at < $2 group by 1 order by 1`, [range.start, range.end]),
      this.query(`select coalesce(provider,'unknown') provider, coalesce(model,'unknown') model,
        coalesce(sum(input_tokens),0)::bigint input_tokens, coalesce(sum(output_tokens),0)::bigint output_tokens,
        coalesce(sum(cached_input_tokens),0)::bigint cached_input_tokens, coalesce(sum(estimated_cost_micros),0)::bigint estimated_cost_micros,
        count(*)::bigint requests, count(*) filter (where pricing_configured)::bigint priced_requests
        from jh_api_requests where occurred_at >= $1 and occurred_at < $2 group by 1,2 order by estimated_cost_micros desc`, [range.start, range.end]),
      this.query(`select endpoint, count(*)::bigint requests, coalesce(sum(estimated_cost_micros),0)::bigint estimated_cost_micros
        from jh_api_requests where occurred_at >= $1 and occurred_at < $2 group by endpoint order by estimated_cost_micros desc`, [range.start, range.end]),
    ]);
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length === results.length) throw failed[0].reason;
    const rows = (index) => results[index].status === 'fulfilled' ? results[index].value.rows : [];
    return {
      range: range.key,
      generatedAt: new Date().toISOString(),
      byDay: rows(0),
      byProvider: rows(1),
      byEndpoint: rows(2),
      partial: failed.length > 0,
      unavailableBreakdowns: ['day', 'provider', 'endpoint'].filter((_, index) => results[index].status === 'rejected'),
    };
  }

  status(extra = {}) {
    return {
      databaseConfigured: this.enabled,
      databaseHealthy: this.enabled && !this.lastError,
      lastDatabaseSuccessAt: this.lastSuccessAt,
      lastDatabaseError: this.lastError,
      droppedWrites: this.droppedWrites,
      retentionDays: this.retentionDays,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt.getTime()) / 1000),
      ...extra,
    };
  }

  async maintain() {
    if (!this.enabled) return false;
    const client = await this.pool.connect();
    try {
      const lock = await client.query("select pg_try_advisory_lock(hashtext('jiahao_observability_maintenance')) locked");
      if (!lock.rows[0]?.locked) return false;
      await client.query('begin');
      await client.query(`insert into jh_daily_traffic (day, visitors, new_visitors, sessions, page_views, active_seconds, bounced_sessions)
        select (s.started_at at time zone '${SHANGHAI_TIME_ZONE}')::date,
          count(distinct s.visitor_id), count(distinct s.visitor_id) filter (where (v.first_seen at time zone '${SHANGHAI_TIME_ZONE}')::date = (s.started_at at time zone '${SHANGHAI_TIME_ZONE}')::date),
          count(*), coalesce(sum(s.page_views),0), coalesce(sum(s.active_seconds),0), count(*) filter (where s.active_seconds < 10 and s.api_requests = 0)
        from jh_sessions s join jh_visitors v on v.visitor_id = s.visitor_id
        where s.started_at < date_trunc('day', now() at time zone '${SHANGHAI_TIME_ZONE}') at time zone '${SHANGHAI_TIME_ZONE}'
        group by 1 on conflict (day) do update set visitors=excluded.visitors,new_visitors=excluded.new_visitors,sessions=excluded.sessions,
          page_views=excluded.page_views,active_seconds=excluded.active_seconds,bounced_sessions=excluded.bounced_sessions,updated_at=now()`);
      await client.query(`insert into jh_daily_api (day, provider, model, endpoint, requests, successes, latency_ms_total, input_tokens, output_tokens, cached_input_tokens, estimated_cost_micros, priced_requests)
        select (occurred_at at time zone '${SHANGHAI_TIME_ZONE}')::date, coalesce(provider,'unknown'), coalesce(model,'unknown'), endpoint,
          count(*), count(*) filter (where ok), coalesce(sum(latency_ms),0), coalesce(sum(input_tokens),0), coalesce(sum(output_tokens),0),
          coalesce(sum(cached_input_tokens),0), coalesce(sum(estimated_cost_micros),0), count(*) filter (where pricing_configured)
        from jh_api_requests where occurred_at < date_trunc('day', now() at time zone '${SHANGHAI_TIME_ZONE}') at time zone '${SHANGHAI_TIME_ZONE}'
        group by 1,2,3,4 on conflict (day,provider,model,endpoint) do update set requests=excluded.requests,successes=excluded.successes,
          latency_ms_total=excluded.latency_ms_total,input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens,
          cached_input_tokens=excluded.cached_input_tokens,estimated_cost_micros=excluded.estimated_cost_micros,priced_requests=excluded.priced_requests,updated_at=now()`);
      await client.query(`delete from jh_page_views where occurred_at < now() - ($1 || ' days')::interval`, [this.retentionDays]);
      await client.query(`delete from jh_api_requests where occurred_at < now() - ($1 || ' days')::interval`, [this.retentionDays]);
      await client.query(`delete from jh_sessions where started_at < now() - ($1 || ' days')::interval`, [this.retentionDays]);
      await client.query("delete from jh_visitors where last_seen < now() - interval '365 days'");
      await client.query("delete from jh_admin_sessions where expires_at < now() or revoked_at < now() - interval '7 days'");
      await client.query('commit');
      return true;
    } catch (error) {
      try { await client.query('rollback'); } catch { /* ignored */ }
      this.lastError = String(error?.message || error).slice(0, 160);
      return false;
    } finally {
      try { await client.query("select pg_advisory_unlock(hashtext('jiahao_observability_maintenance'))"); } catch { /* ignored */ }
      client.release();
    }
  }

  async close() { if (this.pool) await this.pool.end(); }
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export { cookie, SESSION_MAX_AGE_SECONDS };
