import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { parseCookies } from './observability.mjs';
import {
  buildSeasonWindow,
  buildLeagueAwards,
  createLeagueJudge,
  digestRecoveryCode,
  generateRecoveryCode,
  getLeaguePrompt,
  normalizeLeagueAnswer,
  rankLeagueRound,
  shanghaiDate,
} from './league.mjs';

const { Pool } = pg;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOM_CODE_RE = /^[A-Z2-9]{6,10}$/;
const DIMENSION_KEYS = ['mystery', 'flex', 'niche', 'deep', 'show', 'language'];
const NAILOONG_DIMENSION_KEYS = ['hardMouth', 'deadpan', 'hungerResilience', 'abstractReaction', 'cameraSense', 'friendPrank'];
const LEVELS = ['清澈普通人', '嘉豪观察对象', '半步嘉豪', '高阶嘉豪', '豪气冲天', '自在极意豪'];
const TYPES = ['自在极意豪', '美式嘉豪', '深情破碎豪', '计算机嘉豪', '股票嘉豪', '不懂装懂豪', '小众优越豪', '潜伏嘉豪', '反向嘉豪', '无意炫耀豪'];
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const BODY_LIMIT = 256 * 1024;
const ROOM_TASKS = [
  { id: 'hard-mouth-v1', title: '用一句话证明你嘴硬' },
  { id: 'deadpan-v1', title: '发一句让群聊安静三秒的话' },
  { id: 'hunger-v1', title: '描述一次“我不饿”的失败现场' },
  { id: 'camera-v1', title: '给自己的镜头感找一个借口' },
  { id: 'friend-prank-v1', title: '给损友起一个抽象人格称号' },
  { id: 'abstract-reaction-v1', title: '写下你最离谱的临场反应' },
  { id: 'calm-v1', title: '用最淡定的语气说一件大事' },
];

export function dateKey(value) {
  const text = String(value || '');
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function getDailyRoomTask(dateValue) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))
    ? String(dateValue)
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return { ...ROOM_TASKS[((day % ROOM_TASKS.length) + ROOM_TASKS.length) % ROOM_TASKS.length], date, points: 3 };
}

export function compareRoomMembers(a, b) {
  const verifiedGap = Number(Boolean(b.verified)) - Number(Boolean(a.verified));
  if (verifiedGap) return verifiedGap;
  const pointsGap = Number(b.season_points || 0) - Number(a.season_points || 0);
  if (pointsGap) return pointsGap;
  const compositeGap = Number(b.composite_score ?? b.score ?? 0) - Number(a.composite_score ?? a.score ?? 0);
  if (compositeGap) return compositeGap;
  return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
}

export function pointsForBattleOutcome(winner) {
  if (winner === 'A') return { challenger: 2, opponent: 1 };
  if (winner === 'B') return { challenger: 1, opponent: 2 };
  return { challenger: 1, opponent: 1 };
}

function cleanText(value, fallback = '', max = 40) {
  const text = typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '') : '';
  return (text || fallback).slice(0, max);
}

function clampScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
}

function normalizeDimensions(value = {}) {
  return Object.fromEntries(DIMENSION_KEYS.map((key) => [key, clampScore(value?.[key])]));
}

function normalizeNailoong(raw = {}) {
  const dimensions = Object.fromEntries(NAILOONG_DIMENSION_KEYS.map((key) => [key, clampScore(raw?.dimensions?.[key])]));
  const score = clampScore(raw?.score);
  return {
    score,
    level: cleanText(raw?.level, score >= 80 ? '奶龙显形' : score >= 60 ? '奶气在线' : score >= 40 ? '奶龙观察对象' : '暂未奶化', 24),
    archetype: cleanText(raw?.archetype, '淡人型奶龙豪', 32),
    dimensions,
  };
}

function normalizePublicResult(raw = {}, verified = false) {
  const score = clampScore(raw.score);
  const inferredLevel = score >= 95 ? '自在极意豪' : score >= 80 ? '豪气冲天' : score >= 60 ? '高阶嘉豪' : score >= 40 ? '半步嘉豪' : score >= 20 ? '嘉豪观察对象' : '清澈普通人';
  const schemaVersion = Number(raw.schemaVersion) === 2 && raw.nailoong ? 2 : 1;
  const nailoong = schemaVersion === 2 ? normalizeNailoong(raw.nailoong) : null;
  return {
    resultId: cleanText(raw.id, `嘉豪-${createHash('sha256').update(JSON.stringify(raw)).digest('hex').slice(0, 8)}`, 48),
    score,
    level: LEVELS.includes(raw.level) ? raw.level : inferredLevel,
    type: TYPES.includes(raw.type) ? raw.type : '潜伏嘉豪',
    dimensions: normalizeDimensions(raw.dimensions),
    source: cleanText(raw.source, verified ? '云端大模型' : '豪之算法', 40),
    verified,
    ...(schemaVersion === 2 ? {
      schemaVersion,
      nailoong,
      compositeScore: Math.round((score + nailoong.score) / 2),
    } : {}),
  };
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function signSocialResult(result, secret) {
  if (!secret) return null;
  const normalized = normalizePublicResult(result, true);
  const payload = base64urlJson({
    score: normalized.score,
    level: normalized.level,
    type: normalized.type,
    dimensions: normalized.dimensions,
    source: normalized.source,
    ...(normalized.schemaVersion === 2 ? {
      schemaVersion: 2,
      nailoong: normalized.nailoong,
    } : {}),
    issuedAt: Date.now(),
  });
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySocialResultToken(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.issuedAt || Date.now() - Number(parsed.issuedAt) > 30 * 24 * 60 * 60 * 1000) return null;
    return normalizePublicResult(parsed, true);
  } catch {
    return null;
  }
}

function cookie(name, value, req) {
  const secure = process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https';
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function sendJson(res, status, body, cookies = []) {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(cookies.length ? { 'Set-Cookie': cookies } : {}),
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > BODY_LIMIT) throw Object.assign(new Error('请求内容过大'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('请求格式无效'), { statusCode: 400 }); }
}

function createCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = Buffer.from(randomUUID().replaceAll('-', ''), 'hex');
  return Array.from(bytes.subarray(0, 7), (byte) => alphabet[byte % alphabet.length]).join('');
}

function publicMember(row) {
  const nailoong = Number(row.schema_version) === 2 ? {
    score: Number(row.nailoong_score || 0),
    level: row.nailoong_level,
    archetype: row.nailoong_archetype,
    dimensions: row.nailoong_dimensions || {},
  } : null;
  return {
    memberId: row.member_id,
    nickname: row.nickname,
    score: Number(row.score),
    level: row.level,
    type: row.type,
    dimensions: row.dimensions || {},
    verified: Boolean(row.verified),
    source: row.source,
    schemaVersion: Number(row.schema_version || 1),
    nailoong,
    compositeScore: Number(row.composite_score ?? row.score),
    seasonPoints: Number(row.season_points || 0),
    joinedAt: row.joined_at,
    rank: Number(row.rank),
    isSelf: Boolean(row.is_self),
  };
}

function buildBattle(challenger, opponent) {
  const scoreGap = Number(challenger.score) - Number(opponent.score);
  const dimensionTotal = (member) => DIMENSION_KEYS.reduce((sum, key) => sum + clampScore(member.dimensions?.[key]), 0);
  let winner = 'tie';
  if (Math.abs(scoreGap) >= 2) winner = scoreGap > 0 ? 'A' : 'B';
  else {
    const dimensionGap = dimensionTotal(challenger) - dimensionTotal(opponent);
    if (Math.abs(dimensionGap) >= 6) winner = dimensionGap > 0 ? 'A' : 'B';
  }
  const winningName = winner === 'A' ? challenger.nickname : winner === 'B' ? opponent.nickname : '双方';
  const topKeys = DIMENSION_KEYS
    .map((key) => ({ key, gap: Math.abs(clampScore(challenger.dimensions?.[key]) - clampScore(opponent.dimensions?.[key])) }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2)
    .map(({ key }) => ({ mystery: '神秘感', flex: '无意炫耀', niche: '小众优越', deep: '深情浓度', show: '镜头掌控', language: '豪言匹配' })[key]);
  return {
    participants: [challenger, opponent].map((member) => ({
      memberId: member.member_id,
      name: member.nickname,
      score: Number(member.score),
      level: member.level,
      type: member.type,
      dimensions: member.dimensions || {},
      verified: Boolean(member.verified),
    })),
    battle: {
      winner,
      title: winner === 'tie' ? '豪气同频' : `${winningName} 胜出`,
      reason: winner === 'tie'
        ? '双方公开成绩与六维豪气非常接近，这场快速对决暂时难分高下。'
        : `${winningName}在综合分和关键维度上更稳定，本轮公开成绩快速 PK 占据上风。`,
      decisiveDimensions: topKeys,
      source: '好友榜公开成绩裁决',
    },
  };
}

export class SocialService {
  constructor(env = process.env, signingSecret = '', options = {}) {
    this.enabled = Boolean(env.DATABASE_URL);
    this.leagueEnabled = env.LEAGUE_V1_ENABLED !== 'false';
    this.signingSecret = signingSecret;
    this.recoverySecret = env.LEAGUE_RECOVERY_SECRET || signingSecret;
    this.judgeLeagueAnswer = options.judgeLeagueAnswer || createLeagueJudge(env);
    this.recordLeagueEvent = options.recordLeagueEvent || (() => Promise.resolve());
    this.now = options.now || (() => new Date());
    this.pool = this.enabled ? new Pool({
      connectionString: env.DATABASE_URL,
      max: Math.max(1, Number(env.DATABASE_POOL_MAX || 10)),
      idleTimeoutMillis: Math.max(1000, Number(env.DATABASE_IDLE_TIMEOUT_MS || 30_000)),
      connectionTimeoutMillis: Math.max(1000, Number(env.DATABASE_CONNECT_TIMEOUT_MS || 5_000)),
      ssl: env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' },
    }) : null;
    this.rate = new Map();
  }

  async query(text, params = []) {
    if (!this.pool) throw Object.assign(new Error('好友榜数据库尚未配置'), { statusCode: 503 });
    return this.pool.query(text, params);
  }

  visitor(req) {
    const existing = parseCookies(req).jh_social;
    const visitorId = UUID_RE.test(existing || '') ? existing : randomUUID();
    return { visitorId, cookies: existing === visitorId ? [] : [cookie('jh_social', visitorId, req)] };
  }

  allow(req, key, limit = 30, windowMs = 60_000) {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const bucketKey = `${ip}:${key}`;
    const now = Date.now();
    const bucket = this.rate.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      this.rate.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  resolveResult(payload = {}) {
    const verified = verifySocialResultToken(payload.resultToken, this.signingSecret);
    if (payload.resultToken && !verified) throw Object.assign(new Error('云端成绩凭证已失效，请重新鉴定'), { statusCode: 400 });
    return verified || normalizePublicResult(payload.result || {}, false);
  }

  async issueRecovery(client, visitorId, nickname) {
    const existing = await client.query('select recovery_digest from jh_social_profiles where visitor_id=$1', [visitorId]);
    if (existing.rows[0]?.recovery_digest) {
      await client.query(`update jh_social_profiles set nickname=$2, last_active_at=now(), updated_at=now()
        where visitor_id=$1`, [visitorId, nickname]);
      return null;
    }
    if (!this.recoverySecret) throw Object.assign(new Error('恢复口令服务尚未配置'), { statusCode: 503 });
    const recoveryCode = generateRecoveryCode();
    const digest = digestRecoveryCode(recoveryCode, this.recoverySecret);
    await client.query(`insert into jh_social_profiles
      (visitor_id, nickname, recovery_digest, recovery_issued_at, last_active_at)
      values ($1,$2,$3,now(),now())
      on conflict (visitor_id) do update set nickname=excluded.nickname, recovery_digest=excluded.recovery_digest,
        recovery_issued_at=now(), last_active_at=now(), updated_at=now()`, [visitorId, nickname, digest]);
    return recoveryCode;
  }

  async getLeaguePromptForDate(client, date) {
    const override = await client.query(`select prompt_id, character, prompt_text from jh_league_prompt_overrides
      where prompt_date=$1 and active=true`, [date]);
    if (override.rowCount) return { id: override.rows[0].prompt_id, character: override.rows[0].character, text: override.rows[0].prompt_text, date };
    return getLeaguePrompt(date);
  }

  async createLeagueSeason(client, roomId, startDate = shanghaiDate(this.now())) {
    const latest = await client.query('select coalesce(max(season_number),0)::int number from jh_league_seasons where room_id=$1', [roomId]);
    const window = buildSeasonWindow(startDate);
    const seasonId = randomUUID();
    await client.query(`insert into jh_league_seasons
      (season_id, room_id, season_number, start_date, end_date)
      values ($1,$2,$3,$4,$5)`, [seasonId, roomId, Number(latest.rows[0]?.number || 0) + 1, window.startDate, window.endDate]);
    return { season_id: seasonId, room_id: roomId, season_number: Number(latest.rows[0]?.number || 0) + 1, start_date: window.startDate, end_date: window.endDate, status: 'active' };
  }

  async ensureLeagueRound(client, season) {
    const today = shanghaiDate(this.now());
    if (!season || season.status !== 'active' || today < dateKey(season.start_date) || today > dateKey(season.end_date)) return null;
    const existing = await client.query('select * from jh_league_rounds where season_id=$1 and round_date=$2', [season.season_id, today]);
    if (existing.rowCount) return existing.rows[0];
    const prompt = await this.getLeaguePromptForDate(client, today);
    const roundId = randomUUID();
    const inserted = await client.query(`insert into jh_league_rounds
      (round_id, season_id, round_date, prompt_id, character, prompt_text)
      values ($1,$2,$3,$4,$5,$6)
      on conflict (season_id, round_date) do nothing returning *`, [roundId, season.season_id, today, prompt.id, prompt.character, prompt.text]);
    if (inserted.rowCount) return inserted.rows[0];
    return (await client.query('select * from jh_league_rounds where season_id=$1 and round_date=$2', [season.season_id, today])).rows[0];
  }

  async finalizeLeagueRounds(roomId) {
    const today = shanghaiDate(this.now());
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const rounds = await client.query(`select lr.* from jh_league_rounds lr
        join jh_league_seasons ls on ls.season_id=lr.season_id
        where ls.room_id=$1 and lr.status='open' and lr.round_date<$2 for update`, [roomId, today]);
      for (const round of rounds.rows) {
        await this.finalizeLeagueRound(client, round.round_id);
        await client.query("update jh_league_rounds set status='finished', finalized_at=now() where round_id=$1", [round.round_id]);
      }
      await client.query(`update jh_league_seasons set status='finished', finished_at=coalesce(finished_at,now())
        where room_id=$1 and status='active' and end_date<$2`, [roomId, today]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async finalizeLeagueRound(client, roundId) {
    const submissions = await client.query(`select s.submission_id, s.ai_score,
      count(v.submission_id)::int vote_count from jh_league_submissions s
      left join jh_league_votes v on v.submission_id=s.submission_id
      where s.round_id=$1 and s.judge_status='ready' and s.hidden=false
      group by s.submission_id`, [roundId]);
    const ranked = rankLeagueRound(submissions.rows.map((row) => ({ submissionId: row.submission_id, aiScore: row.ai_score, voteCount: row.vote_count })));
    for (const entry of ranked) {
      await client.query(`update jh_league_submissions set finalized_points=$2, popularity_bonus=$3
        where submission_id=$1`, [entry.submissionId, entry.seasonPoints, entry.popularityBonus]);
    }
  }

  async createLeagueRoom(visitorId, payload) {
    if (!this.leagueEnabled) throw Object.assign(new Error('好友联赛正在准备中'), { statusCode: 503 });
    const name = cleanText(payload.name, '七日抽象联赛', 40);
    const nickname = cleanText(payload.nickname, '奶龙本人', 24);
    const memberLimit = Math.max(2, Math.min(20, Math.round(Number(payload.memberLimit || 12))));
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      let code;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        code = createCode();
        const exists = await client.query('select 1 from jh_rooms where code=$1', [code]);
        if (!exists.rowCount) break;
      }
      const roomId = randomUUID();
      const memberId = randomUUID();
      await client.query(`insert into jh_rooms
        (room_id, code, owner_visitor_id, name, room_type, member_limit, allow_pk, expires_at)
        values ($1,$2,$3,$4,'league',$5,false,now()+interval '30 days')`, [roomId, code, visitorId, name, memberLimit]);
      await client.query(`insert into jh_league_members (member_id,room_id,visitor_id,nickname)
        values ($1,$2,$3,$4)`, [memberId, roomId, visitorId, nickname]);
      const recoveryCode = await this.issueRecovery(client, visitorId, nickname);
      const season = await this.createLeagueSeason(client, roomId);
      await this.ensureLeagueRound(client, season);
      await client.query('commit');
      return { code, roomType: 'league', ...(recoveryCode ? { recoveryCode } : {}) };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async joinLeagueRoom(code, visitorId, payload) {
    const nickname = cleanText(payload.nickname, '奶龙本人', 24);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const found = await client.query("select * from jh_rooms where code=$1 and room_type='league' and status='active' for update", [code]);
      if (!found.rowCount) throw Object.assign(new Error('联赛不存在或已结束'), { statusCode: 404 });
      const room = found.rows[0];
      const existing = await client.query('select member_id from jh_league_members where room_id=$1 and visitor_id=$2', [room.room_id, visitorId]);
      let joined = false;
      if (!existing.rowCount) {
        const count = await client.query('select count(*)::int count from jh_league_members where room_id=$1', [room.room_id]);
        if (Number(count.rows[0]?.count || 0) >= Number(room.member_limit)) throw Object.assign(new Error('联赛人数已满'), { statusCode: 409 });
        await client.query('insert into jh_league_members (member_id,room_id,visitor_id,nickname) values ($1,$2,$3,$4)', [randomUUID(), room.room_id, visitorId, nickname]);
        joined = true;
      } else {
        await client.query('update jh_league_members set nickname=$3,last_active_at=now() where room_id=$1 and visitor_id=$2', [room.room_id, visitorId, nickname]);
      }
      const recoveryCode = await this.issueRecovery(client, visitorId, nickname);
      await client.query("update jh_rooms set expires_at=now()+interval '30 days',updated_at=now() where room_id=$1", [room.room_id]);
      await client.query('commit');
      return { joined: true, firstJoin: joined, ...(recoveryCode ? { recoveryCode } : {}) };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async getLeagueContext(code, visitorId) {
    const roomResult = await this.query(`select r.*, (r.owner_visitor_id=$2) is_owner,
      (select count(*)::int from jh_league_members lm where lm.room_id=r.room_id) member_count
      from jh_rooms r where r.code=$1 and r.room_type='league'`, [code, visitorId]);
    if (!roomResult.rowCount) throw Object.assign(new Error('联赛不存在或链接无效'), { statusCode: 404 });
    const room = roomResult.rows[0];
    await this.finalizeLeagueRounds(room.room_id);
    const member = await this.query('select * from jh_league_members where room_id=$1 and visitor_id=$2', [room.room_id, visitorId]);
    const seasonResult = await this.query('select * from jh_league_seasons where room_id=$1 order by season_number desc limit 1', [room.room_id]);
    let season = seasonResult.rows[0] || null;
    if (!season) {
      const client = await this.pool.connect();
      try { season = await this.createLeagueSeason(client, room.room_id); }
      finally { client.release(); }
    }
    const round = await this.ensureLeagueRound(this.pool, season);
    return { room, member: member.rows[0] || null, season, round };
  }

  async leagueRoom(code, visitorId) {
    const { room, member, season, round } = await this.getLeagueContext(code, visitorId);
    const isMember = Boolean(member);
    let ownSubmission = null;
    let entries = [];
    if (round && member) {
      ownSubmission = (await this.query('select * from jh_league_submissions where round_id=$1 and member_id=$2', [round.round_id, member.member_id])).rows[0] || null;
      if (ownSubmission?.judge_status === 'ready') {
        const result = await this.query(`select s.*, lm.nickname, lm.visitor_id,
          count(v.submission_id)::int vote_count,
          bool_or(v.voter_member_id=$2) is_voted
          from jh_league_submissions s join jh_league_members lm on lm.member_id=s.member_id
          left join jh_league_votes v on v.submission_id=s.submission_id
          where s.round_id=$1 and s.judge_status='ready' and s.hidden=false
          group by s.submission_id,lm.nickname,lm.visitor_id order by s.created_at`, [round.round_id, member.member_id]);
        const ranked = rankLeagueRound(result.rows.map((row) => ({ submissionId: row.submission_id, aiScore: row.ai_score, voteCount: row.vote_count })));
        const rankMap = new Map(ranked.map((item) => [item.submissionId, item]));
        entries = result.rows.map((row) => ({
          submissionId: row.submission_id,
          memberId: row.member_id,
          nickname: row.nickname,
          answer: row.answer_text,
          aiScore: Number(row.ai_score),
          tag: row.tag,
          verdict: row.verdict,
          voteCount: Number(row.vote_count),
          isSelf: row.member_id === member.member_id,
          isVoted: Boolean(row.is_voted),
          totalScore: rankMap.get(row.submission_id)?.totalScore || Number(row.ai_score),
          provisionalRank: rankMap.get(row.submission_id)?.rank || null,
          shareAnswer: Boolean(row.share_answer),
        }));
      }
    }
    const standingsResult = await this.query(`select lm.member_id,lm.nickname,
      coalesce(sum(s.finalized_points),0)::int season_points,
      count(s.submission_id) filter (where s.judge_status='ready')::int days_played
      from jh_league_members lm
      left join jh_league_submissions s on s.member_id=lm.member_id
        and exists (select 1 from jh_league_rounds lr where lr.round_id=s.round_id and lr.season_id=$2)
      where lm.room_id=$1 group by lm.member_id,lm.nickname
      order by season_points desc,days_played desc,lm.joined_at`, [room.room_id, season.season_id]);
    const startDate = dateKey(season.start_date);
    const today = shanghaiDate(this.now());
    const day = Math.max(1, Math.min(7, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1));
    const unlocks = isMember ? (await this.query('select unlock_key from jh_league_unlocks where visitor_id=$1 order by unlocked_at', [visitorId])).rows.map((row) => row.unlock_key) : [];
    const standings = isMember ? standingsResult.rows.map((row, index) => ({
      rank: index + 1, memberId: row.member_id, nickname: row.nickname,
      seasonPoints: Number(row.season_points), daysPlayed: Number(row.days_played), isSelf: row.member_id === member.member_id,
    })) : [];
    let awards = [];
    if (isMember && season.status === 'finished' && standings.length) {
      const stats = await this.query(`select lm.member_id,lm.nickname,s.ai_score,
        (select count(*)::int from jh_league_votes v where v.submission_id=s.submission_id) vote_count
        from jh_league_members lm left join jh_league_submissions s on s.member_id=lm.member_id
          and exists (select 1 from jh_league_rounds lr where lr.round_id=s.round_id and lr.season_id=$2)
        where lm.room_id=$1 and (s.submission_id is null or s.judge_status='ready')`, [room.room_id, season.season_id]);
      awards = buildLeagueAwards(standings, stats.rows);
    }
    const pendingJudgement = isMember ? (await this.query(`select s.submission_id,lr.round_date
      from jh_league_submissions s join jh_league_rounds lr on lr.round_id=s.round_id
      join jh_league_seasons ls on ls.season_id=lr.season_id
      where ls.room_id=$1 and s.member_id=$2 and s.judge_status in ('pending','failed')
      order by lr.round_date desc limit 1`, [room.room_id, member.member_id])).rows[0] : null;
    return {
      room: {
        code: room.code, name: room.name, roomType: 'league', memberLimit: Number(room.member_limit),
        memberCount: Number(room.member_count), isOwner: Boolean(room.is_owner), status: room.status,
      },
      isMember,
      member: member ? { memberId: member.member_id, nickname: member.nickname } : null,
      season: {
        number: Number(season.season_number), startDate, endDate: dateKey(season.end_date),
        status: season.status, day,
      },
      round: round ? {
        date: dateKey(round.round_date), promptId: round.prompt_id, character: round.character,
        prompt: round.prompt_text, status: round.status, hasSubmitted: ownSubmission?.judge_status === 'ready',
        judgementStatus: ownSubmission?.judge_status || null, submissionId: ownSubmission?.submission_id || null,
      } : null,
      pendingJudgement: pendingJudgement ? { submissionId: pendingJudgement.submission_id, roundDate: dateKey(pendingJudgement.round_date) } : null,
      entries: isMember && ownSubmission?.judge_status === 'ready' ? entries : [],
      standings,
      awards,
      unlocks,
      privacy: 'AI 分数与判词仅供娱乐；答案仅赛季内房间成员可见，赛季结束 7 天后删除原句。',
    };
  }

  async submitLeagueAnswer(code, visitorId, payload) {
    const answer = normalizeLeagueAnswer(payload.answer);
    const idempotencyKey = String(payload.idempotencyKey || '');
    if (!UUID_RE.test(idempotencyKey)) throw Object.assign(new Error('提交凭据无效，请刷新后重试'), { statusCode: 400 });
    const { room, member, season, round } = await this.getLeagueContext(code, visitorId);
    if (!member) throw Object.assign(new Error('加入联赛后才能作答'), { statusCode: 403 });
    if (!round || season.status !== 'active') throw Object.assign(new Error('本赛季已结束'), { statusCode: 410 });
    const existing = await this.query('select submission_id,idempotency_key,judge_status from jh_league_submissions where round_id=$1 and member_id=$2', [round.round_id, member.member_id]);
    if (existing.rowCount) {
      if (existing.rows[0].idempotency_key === idempotencyKey && existing.rows[0].judge_status !== 'ready') return this.retryLeagueJudgement(code, visitorId);
      if (existing.rows[0].idempotency_key === idempotencyKey) return this.leagueRoom(code, visitorId);
      throw Object.assign(new Error('今天已经交卷，答案不能修改'), { statusCode: 409 });
    }
    const submissionId = randomUUID();
    try {
      await this.query(`insert into jh_league_submissions
        (submission_id,round_id,member_id,answer_text,idempotency_key,judge_status,share_answer)
        values ($1,$2,$3,$4,$5,'pending',$6)`, [submissionId, round.round_id, member.member_id, answer, idempotencyKey, payload.shareAnswer === true]);
    } catch (error) {
      if (error.code === '23505') return this.retryLeagueJudgement(code, visitorId);
      throw error;
    }
    return this.retryLeagueJudgement(code, visitorId);
  }

  async retryLeagueJudgement(code, visitorId, payload = {}) {
    const requestedId = payload.submissionId ? String(payload.submissionId) : null;
    if (requestedId && !UUID_RE.test(requestedId)) throw Object.assign(new Error('重判目标无效'), { statusCode: 400 });
    const client = await this.pool.connect();
    let locked = false;
    let lockKey = '';
    try {
      const target = await client.query(`select s.submission_id,s.answer_text,s.judge_status,s.member_id,
        lr.round_id,lr.prompt_text,lr.character,lr.status round_status,ls.season_id,r.room_id
        from jh_league_submissions s join jh_league_members lm on lm.member_id=s.member_id
        join jh_league_rounds lr on lr.round_id=s.round_id join jh_league_seasons ls on ls.season_id=lr.season_id
        join jh_rooms r on r.room_id=ls.room_id
        where r.code=$1 and lm.visitor_id=$2 and s.judge_status in ('pending','failed')
          and ($3::uuid is null or s.submission_id=$3::uuid)
        order by lr.round_date desc limit 1`, [code, visitorId, requestedId]);
      if (!target.rowCount) throw Object.assign(new Error('还没有可重判的答案'), { statusCode: 404 });
      const submission = target.rows[0];
      lockKey = `league-judge:${submission.round_id}:${submission.member_id}`;
      const lock = await client.query('select pg_try_advisory_lock(hashtext($1)) locked', [lockKey]);
      locked = Boolean(lock.rows[0]?.locked);
      if (!locked) return this.leagueRoom(code, visitorId);
      const existing = await client.query(`select submission_id,answer_text,judge_status from jh_league_submissions
        where submission_id=$1`, [submission.submission_id]);
      if (!existing.rowCount) throw Object.assign(new Error('还没有可重判的答案'), { statusCode: 404 });
      if (existing.rows[0].judge_status === 'ready') return this.leagueRoom(code, visitorId);
      let judged;
      try {
        await client.query("update jh_league_submissions set judge_status='pending' where submission_id=$1", [existing.rows[0].submission_id]);
        judged = await this.judgeLeagueAnswer({ prompt: submission.prompt_text, answer: existing.rows[0].answer_text, character: submission.character });
      } catch (error) {
        await client.query("update jh_league_submissions set judge_status='failed' where submission_id=$1", [existing.rows[0].submission_id]);
        throw Object.assign(new Error('AI 暂时没判完，答案已保留，可稍后重试'), { statusCode: 503, code: 'LEAGUE_JUDGE_PENDING', cause: error });
      }
      if (!judged.data.publishable) {
        await client.query('delete from jh_league_submissions where submission_id=$1', [existing.rows[0].submission_id]);
        throw Object.assign(new Error('这段内容不适合公开到好友房'), { statusCode: 400, code: 'LEAGUE_CONTENT_BLOCKED' });
      }
      await client.query('begin');
      await client.query(`update jh_league_submissions set judge_status='ready',ai_score=$2,tag=$3,verdict=$4,judged_at=now()
        where submission_id=$1`, [existing.rows[0].submission_id, judged.data.score, judged.data.tag, judged.data.verdict]);
      const played = await client.query(`select count(*)::int count from jh_league_submissions s
        join jh_league_rounds lr on lr.round_id=s.round_id where s.member_id=$1 and lr.season_id=$2 and s.judge_status='ready'`, [submission.member_id, submission.season_id]);
      const count = Number(played.rows[0]?.count || 0);
      const keys = [`tag:${judged.data.tag}`, ...(count >= 1 ? ['league:first'] : []), ...(count >= 3 ? ['league:streak-3'] : []), ...(count >= 7 ? ['league:season-7'] : [])];
      for (const key of keys) await client.query(`insert into jh_league_unlocks (visitor_id,unlock_key) values ($1,$2) on conflict do nothing`, [visitorId, key]);
      if (submission.round_status === 'finished') await this.finalizeLeagueRound(client, submission.round_id);
      await client.query("update jh_rooms set expires_at=now()+interval '30 days',updated_at=now() where room_id=$1", [submission.room_id]);
      await client.query('update jh_league_members set last_active_at=now() where member_id=$1', [submission.member_id]);
      await client.query('commit');
    } catch (error) {
      try { await client.query('rollback'); } catch { /* no active transaction */ }
      throw error;
    } finally {
      if (locked) await client.query('select pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => {});
      client.release();
    }
    return this.leagueRoom(code, visitorId);
  }

  async voteLeagueAnswer(code, visitorId, payload) {
    const submissionId = String(payload.submissionId || '');
    if (!UUID_RE.test(submissionId)) throw Object.assign(new Error('投票目标无效'), { statusCode: 400 });
    const { member, round } = await this.getLeagueContext(code, visitorId);
    if (!member || !round || round.status !== 'open') throw Object.assign(new Error('当前不能投票'), { statusCode: 403 });
    const own = await this.query("select 1 from jh_league_submissions where round_id=$1 and member_id=$2 and judge_status='ready'", [round.round_id, member.member_id]);
    if (!own.rowCount) throw Object.assign(new Error('先完成今日作答才能投票'), { statusCode: 403 });
    const target = await this.query(`select s.submission_id,s.member_id from jh_league_submissions s
      where s.submission_id=$1 and s.round_id=$2 and s.judge_status='ready' and s.hidden=false`, [submissionId, round.round_id]);
    if (!target.rowCount) throw Object.assign(new Error('答案不存在或已隐藏'), { statusCode: 404 });
    if (target.rows[0].member_id === member.member_id) throw Object.assign(new Error('不能给自己投票'), { statusCode: 400 });
    await this.query(`insert into jh_league_votes (round_id,voter_member_id,submission_id)
      values ($1,$2,$3) on conflict (round_id,voter_member_id)
      do update set submission_id=excluded.submission_id,updated_at=now()`, [round.round_id, member.member_id, submissionId]);
    return this.leagueRoom(code, visitorId);
  }

  async reportLeagueAnswer(code, visitorId, payload) {
    const submissionId = String(payload.submissionId || '');
    const reason = cleanText(payload.reason, '不适合好友房', 40);
    const { member } = await this.getLeagueContext(code, visitorId);
    if (!member || !UUID_RE.test(submissionId)) throw Object.assign(new Error('加入房间后才能举报'), { statusCode: 403 });
    const target = await this.query(`select s.submission_id from jh_league_submissions s
      join jh_league_rounds lr on lr.round_id=s.round_id join jh_league_seasons ls on ls.season_id=lr.season_id
      join jh_rooms r on r.room_id=ls.room_id where s.submission_id=$1 and r.code=$2`, [submissionId, code]);
    if (!target.rowCount) throw Object.assign(new Error('答案不存在'), { statusCode: 404 });
    await this.query(`insert into jh_league_reports (report_id,submission_id,reporter_member_id,reason)
      values ($1,$2,$3,$4) on conflict (submission_id,reporter_member_id) do nothing`, [randomUUID(), submissionId, member.member_id, reason]);
    return { reported: true };
  }

  async moderateLeagueAnswer(code, visitorId, payload) {
    const submissionId = String(payload.submissionId || '');
    const hidden = payload.hidden !== false;
    const room = await this.query("select room_id from jh_rooms where code=$1 and room_type='league' and owner_visitor_id=$2", [code, visitorId]);
    if (!room.rowCount) throw Object.assign(new Error('只有房主可以管理内容'), { statusCode: 403 });
    const result = await this.query(`update jh_league_submissions s set hidden=$3
      from jh_league_rounds lr join jh_league_seasons ls on ls.season_id=lr.season_id
      where s.submission_id=$1 and s.round_id=lr.round_id and ls.room_id=$2 returning s.submission_id`, [submissionId, room.rows[0].room_id, hidden]);
    if (!result.rowCount) throw Object.assign(new Error('答案不存在'), { statusCode: 404 });
    return { moderated: true, hidden };
  }

  async removeLeagueMember(code, visitorId, payload) {
    const memberId = String(payload.memberId || '');
    const room = await this.query("select room_id from jh_rooms where code=$1 and room_type='league' and owner_visitor_id=$2", [code, visitorId]);
    if (!room.rowCount) throw Object.assign(new Error('只有房主可以移除成员'), { statusCode: 403 });
    const target = await this.query(`delete from jh_league_members lm using jh_rooms r
      where lm.member_id=$1 and lm.room_id=$2 and r.room_id=lm.room_id and lm.visitor_id<>r.owner_visitor_id returning lm.member_id`, [memberId, room.rows[0].room_id]);
    if (!target.rowCount) throw Object.assign(new Error('不能移除房主或成员不存在'), { statusCode: 400 });
    return { removed: true };
  }

  async startNextLeagueSeason(code, visitorId) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const room = await client.query("select * from jh_rooms where code=$1 and room_type='league' and owner_visitor_id=$2 for update", [code, visitorId]);
      if (!room.rowCount) throw Object.assign(new Error('只有房主可以开启下一季'), { statusCode: 403 });
      const active = await client.query("select 1 from jh_league_seasons where room_id=$1 and status='active'", [room.rows[0].room_id]);
      if (active.rowCount) throw Object.assign(new Error('当前赛季还没有结束'), { statusCode: 409 });
      const season = await this.createLeagueSeason(client, room.rows[0].room_id);
      await this.ensureLeagueRound(client, season);
      await client.query("update jh_rooms set expires_at=now()+interval '30 days',updated_at=now() where room_id=$1", [room.rows[0].room_id]);
      await client.query('commit');
      return this.leagueRoom(code, visitorId);
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async rotateRecovery(visitorId) {
    if (!this.recoverySecret) throw Object.assign(new Error('恢复口令服务尚未配置'), { statusCode: 503 });
    const code = generateRecoveryCode();
    const result = await this.query(`update jh_social_profiles set recovery_digest=$2,recovery_issued_at=now(),updated_at=now()
      where visitor_id=$1 returning visitor_id`, [visitorId, digestRecoveryCode(code, this.recoverySecret)]);
    if (!result.rowCount) throw Object.assign(new Error('先加入一个联赛才能生成恢复口令'), { statusCode: 404 });
    return { recoveryCode: code };
  }

  async recoverIdentity(code) {
    if (!this.recoverySecret) throw Object.assign(new Error('恢复口令服务尚未配置'), { statusCode: 503 });
    const normalized = String(code || '').trim();
    if (!/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/i.test(normalized)) throw Object.assign(new Error('恢复口令格式无效'), { statusCode: 400 });
    const digest = digestRecoveryCode(normalized, this.recoverySecret);
    const profile = await this.query('select visitor_id,nickname from jh_social_profiles where recovery_digest=$1', [digest]);
    if (!profile.rowCount) throw Object.assign(new Error('恢复口令无效或已换新'), { statusCode: 404 });
    await this.query('update jh_social_profiles set last_active_at=now(),updated_at=now() where visitor_id=$1', [profile.rows[0].visitor_id]);
    return { visitorId: profile.rows[0].visitor_id, nickname: profile.rows[0].nickname };
  }

  async deleteIdentity(visitorId) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('delete from jh_rooms where owner_visitor_id=$1', [visitorId]);
      await client.query('delete from jh_league_members where visitor_id=$1', [visitorId]);
      await client.query('delete from jh_room_members where visitor_id=$1', [visitorId]);
      await client.query('delete from jh_league_unlocks where visitor_id=$1', [visitorId]);
      await client.query('delete from jh_social_profiles where visitor_id=$1', [visitorId]);
      await client.query('commit');
      return { deleted: true };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async maintain() {
    if (!this.enabled) return false;
    await this.query(`update jh_rooms set status='closed',updated_at=now()
      where room_type='league' and status='active' and expires_at<now()`);
    await this.query(`update jh_league_submissions s set answer_text=null,answer_deleted_at=now()
      from jh_league_rounds lr join jh_league_seasons ls on ls.season_id=lr.season_id
      where s.round_id=lr.round_id and s.answer_text is not null
        and ls.end_date < (now() at time zone 'Asia/Shanghai')::date - 7`);
    await this.query(`delete from jh_league_votes v using jh_league_rounds lr,jh_league_seasons ls
      where v.round_id=lr.round_id and lr.season_id=ls.season_id
        and ls.end_date < (now() at time zone 'Asia/Shanghai')::date - 7`);
    return true;
  }

  async session(visitorId) {
    const [legacyRooms, leagueRooms, profile, unlocks] = await Promise.all([
      this.query(`select r.code, r.name, r.room_type, r.status, r.expires_at,
        (r.owner_visitor_id = $1) as is_owner, m.score, m.level,
        (select count(*)::int from jh_room_members x where x.room_id = r.room_id) as member_count,
        m.joined_at
        from jh_room_members m join jh_rooms r on r.room_id = m.room_id
        where m.visitor_id = $1 order by m.joined_at desc limit 20`, [visitorId]),
      this.query(`select r.code,r.name,r.room_type,r.status,r.expires_at,
        (r.owner_visitor_id=$1) is_owner,null::smallint score,'7 日联赛'::varchar level,
        (select count(*)::int from jh_league_members x where x.room_id=r.room_id) member_count,
        lm.joined_at from jh_league_members lm join jh_rooms r on r.room_id=lm.room_id
        where lm.visitor_id=$1 order by lm.last_active_at desc limit 20`, [visitorId]),
      this.query('select nickname,recovery_digest from jh_social_profiles where visitor_id=$1', [visitorId]),
      this.query('select unlock_key from jh_league_unlocks where visitor_id=$1 order by unlocked_at', [visitorId]),
    ]);
    const rooms = [...leagueRooms.rows, ...legacyRooms.rows].sort((a, b) => new Date(b.joined_at) - new Date(a.joined_at)).slice(0, 20);
    return {
      nickname: profile.rows[0]?.nickname || '', rooms,
      recoveryConfigured: Boolean(profile.rows[0]?.recovery_digest),
      unlocks: unlocks.rows.map((row) => row.unlock_key),
      leagueEnabled: this.leagueEnabled,
    };
  }

  async room(code, visitorId) {
    const roomType = await this.query('select room_type from jh_rooms where code=$1', [code]);
    if (roomType.rows[0]?.room_type === 'league') return this.leagueRoom(code, visitorId);
    const roomResult = await this.query(`select r.*,
      (r.owner_visitor_id = $2) as is_owner,
      (select count(*)::int from jh_room_members x where x.room_id = r.room_id) as member_count
      from jh_rooms r where r.code = $1`, [code, visitorId]);
    if (!roomResult.rowCount) throw Object.assign(new Error('好友榜不存在或链接无效'), { statusCode: 404 });
    const room = roomResult.rows[0];
    const members = await this.query(`select m.*,
      row_number() over (order by m.verified desc, m.season_points desc, m.composite_score desc, m.joined_at asc) as rank,
      (m.visitor_id = $2) as is_self
      from jh_room_members m where m.room_id = $1
      order by m.verified desc, m.season_points desc, m.composite_score desc, m.joined_at asc`, [room.room_id, visitorId]);
    const task = await this.query(`select 1 from jh_room_task_attempts
      where room_id=$1 and visitor_id=$2 and task_date=(now() at time zone 'Asia/Shanghai')::date
      limit 1`, [room.room_id, visitorId]);
    const scores = members.rows.map((row) => Number(row.score));
    return {
      room: {
        code: room.code,
        name: room.name,
        roomType: room.room_type,
        memberLimit: Number(room.member_limit),
        memberCount: Number(room.member_count),
        allowPk: Boolean(room.allow_pk),
        status: room.status,
        expiresAt: room.expires_at,
        isOwner: Boolean(room.is_owner),
        isExpired: new Date(room.expires_at).getTime() <= Date.now(),
        averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
        highestScore: scores.length ? Math.max(...scores) : 0,
      },
      members: members.rows.map(publicMember),
      isMember: members.rows.some((row) => row.visitor_id === visitorId),
      todayTaskCompleted: Boolean(task.rowCount),
      dailyTask: getDailyRoomTask(),
    };
  }

  async createRoom(visitorId, payload) {
    if (payload.roomType === 'league') return this.createLeagueRoom(visitorId, payload);
    const result = this.resolveResult(payload);
    const name = cleanText(payload.name, '好友豪气榜', 40);
    const nickname = cleanText(payload.nickname, '匿名嘉豪', 24);
    const roomType = ['friends', 'dorm', 'pk', 'challenge'].includes(payload.roomType) ? payload.roomType : 'friends';
    const memberLimit = Math.max(2, Math.min(50, Math.round(Number(payload.memberLimit || (roomType === 'dorm' ? 8 : 20)))));
    const activeRooms = await this.query("select count(*)::int count from jh_rooms where owner_visitor_id = $1 and status = 'active' and expires_at > now()", [visitorId]);
    if (Number(activeRooms.rows[0]?.count || 0) >= 10) throw Object.assign(new Error('最多同时创建 10 个有效好友榜'), { statusCode: 429 });

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(`insert into jh_social_profiles (visitor_id, nickname) values ($1, $2)
        on conflict (visitor_id) do update set nickname = excluded.nickname, updated_at = now()`, [visitorId, nickname]);
      let code;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        code = createCode();
        const exists = await client.query('select 1 from jh_rooms where code = $1', [code]);
        if (!exists.rowCount) break;
      }
      const roomId = randomUUID();
      await client.query(`insert into jh_rooms
        (room_id, code, owner_visitor_id, name, room_type, member_limit, allow_pk, expires_at)
        values ($1,$2,$3,$4,$5,$6,$7,now() + interval '7 days')`,
      [roomId, code, visitorId, name, roomType, memberLimit, payload.allowPk !== false]);
      await client.query(`insert into jh_room_members
        (member_id, room_id, visitor_id, nickname, result_id, score, level, type, dimensions, verified, source,
         schema_version, nailoong_score, nailoong_level, nailoong_archetype, nailoong_dimensions, composite_score)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`,
      [randomUUID(), roomId, visitorId, nickname, result.resultId, result.score, result.level, result.type, JSON.stringify(result.dimensions), result.verified, result.source,
        result.schemaVersion || 1, result.nailoong?.score ?? null, result.nailoong?.level ?? null, result.nailoong?.archetype ?? null,
        JSON.stringify(result.nailoong?.dimensions || {}), result.compositeScore ?? result.score]);
      await client.query('commit');
      return { code };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async joinRoom(code, visitorId, payload) {
    const roomType = await this.query('select room_type from jh_rooms where code=$1', [code]);
    if (roomType.rows[0]?.room_type === 'league') return this.joinLeagueRoom(code, visitorId, payload);
    const result = this.resolveResult(payload);
    const nickname = cleanText(payload.nickname, '匿名嘉豪', 24);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const roomResult = await client.query('select * from jh_rooms where code = $1 for update', [code]);
      if (!roomResult.rowCount) throw Object.assign(new Error('好友榜不存在或链接无效'), { statusCode: 404 });
      const room = roomResult.rows[0];
      if (room.status !== 'active' || new Date(room.expires_at).getTime() <= Date.now()) throw Object.assign(new Error('这个好友榜已经结束'), { statusCode: 410 });
      const existing = await client.query('select member_id from jh_room_members where room_id = $1 and visitor_id = $2', [room.room_id, visitorId]);
      if (!existing.rowCount) {
        const count = await client.query('select count(*)::int count from jh_room_members where room_id = $1', [room.room_id]);
        if (Number(count.rows[0].count) >= Number(room.member_limit)) throw Object.assign(new Error('好友榜人数已满'), { statusCode: 409 });
        await client.query(`insert into jh_room_members
          (member_id, room_id, visitor_id, nickname, result_id, score, level, type, dimensions, verified, source,
           schema_version, nailoong_score, nailoong_level, nailoong_archetype, nailoong_dimensions, composite_score)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)`,
        [randomUUID(), room.room_id, visitorId, nickname, result.resultId, result.score, result.level, result.type, JSON.stringify(result.dimensions), result.verified, result.source,
          result.schemaVersion || 1, result.nailoong?.score ?? null, result.nailoong?.level ?? null, result.nailoong?.archetype ?? null,
          JSON.stringify(result.nailoong?.dimensions || {}), result.compositeScore ?? result.score]);
      } else {
        await client.query(`update jh_room_members set nickname=$3, result_id=$4, score=$5, level=$6, type=$7,
          dimensions=$8::jsonb, verified=$9, source=$10, schema_version=$11, nailoong_score=$12, nailoong_level=$13,
          nailoong_archetype=$14, nailoong_dimensions=$15::jsonb, composite_score=$16, updated_at=now()
          where room_id=$1 and visitor_id=$2`,
        [room.room_id, visitorId, nickname, result.resultId, result.score, result.level, result.type, JSON.stringify(result.dimensions), result.verified, result.source,
          result.schemaVersion || 1, result.nailoong?.score ?? null, result.nailoong?.level ?? null, result.nailoong?.archetype ?? null,
          JSON.stringify(result.nailoong?.dimensions || {}), result.compositeScore ?? result.score]);
      }
      await client.query(`insert into jh_social_profiles (visitor_id, nickname) values ($1, $2)
        on conflict (visitor_id) do update set nickname = excluded.nickname, updated_at = now()`, [visitorId, nickname]);
      await client.query('commit');
      return { joined: true };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async updateScore(code, visitorId, payload) {
    const result = this.resolveResult(payload);
    const updated = await this.query(`update jh_room_members m set result_id=$3, score=$4, level=$5, type=$6,
      dimensions=$7::jsonb, verified=$8, source=$9, schema_version=$10, nailoong_score=$11,
      nailoong_level=$12, nailoong_archetype=$13, nailoong_dimensions=$14::jsonb, composite_score=$15, updated_at=now()
      from jh_rooms r where m.room_id=r.room_id and r.code=$1 and m.visitor_id=$2 returning m.member_id`,
    [code, visitorId, result.resultId, result.score, result.level, result.type, JSON.stringify(result.dimensions), result.verified, result.source,
      result.schemaVersion || 1, result.nailoong?.score ?? null, result.nailoong?.level ?? null, result.nailoong?.archetype ?? null,
      JSON.stringify(result.nailoong?.dimensions || {}), result.compositeScore ?? result.score]);
    if (!updated.rowCount) throw Object.assign(new Error('你还没有加入这个好友榜'), { statusCode: 403 });
    return { updated: true };
  }

  async leaveRoom(code, visitorId) {
    const room = await this.query('select room_id, owner_visitor_id from jh_rooms where code=$1', [code]);
    if (!room.rowCount) throw Object.assign(new Error('好友榜不存在'), { statusCode: 404 });
    if (room.rows[0].owner_visitor_id === visitorId) throw Object.assign(new Error('榜主不能直接退出，请先结束好友榜'), { statusCode: 409 });
    await this.query('delete from jh_room_members where room_id=$1 and visitor_id=$2', [room.rows[0].room_id, visitorId]);
    return { left: true };
  }

  async closeRoom(code, visitorId) {
    const closed = await this.query("update jh_rooms set status='closed', updated_at=now() where code=$1 and owner_visitor_id=$2 returning room_id", [code, visitorId]);
    if (!closed.rowCount) throw Object.assign(new Error('只有榜主可以结束好友榜'), { statusCode: 403 });
    return { closed: true };
  }

  async pk(code, visitorId, payload) {
    const targetId = cleanText(payload.opponentMemberId, '', 48);
    if (!UUID_RE.test(targetId)) throw Object.assign(new Error('对手信息无效'), { statusCode: 400 });
    const room = await this.query('select room_id, allow_pk from jh_rooms where code=$1 and status=\'active\' and expires_at>now()', [code]);
    if (!room.rowCount) throw Object.assign(new Error('好友榜已结束或不存在'), { statusCode: 404 });
    if (!room.rows[0].allow_pk) throw Object.assign(new Error('榜主已关闭房间 PK'), { statusCode: 403 });
    const members = await this.query(`select * from jh_room_members where room_id=$1 and (visitor_id=$2 or member_id=$3)`, [room.rows[0].room_id, visitorId, targetId]);
    const challenger = members.rows.find((item) => item.visitor_id === visitorId);
    const opponent = members.rows.find((item) => item.member_id === targetId);
    if (!challenger) throw Object.assign(new Error('加入好友榜后才能发起 PK'), { statusCode: 403 });
    if (!opponent || opponent.member_id === challenger.member_id) throw Object.assign(new Error('请选择其他成员作为对手'), { statusCode: 400 });
    const battle = buildBattle(challenger, opponent);
    const winnerMemberId = battle.battle.winner === 'A' ? challenger.member_id : battle.battle.winner === 'B' ? opponent.member_id : null;
    await this.query(`insert into jh_room_pk_matches
      (match_id, room_id, challenger_member_id, opponent_member_id, winner_member_id, result)
      values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [randomUUID(), room.rows[0].room_id, challenger.member_id, opponent.member_id, winnerMemberId, JSON.stringify(battle)]);
    const points = pointsForBattleOutcome(battle.battle.winner);
    await this.query(`update jh_room_members set season_points = season_points +
      case when member_id=$2 then $4::int when member_id=$3 then $5::int else 0 end, updated_at=now()
      where room_id=$1 and member_id in ($2,$3)`, [room.rows[0].room_id, challenger.member_id, opponent.member_id, points.challenger, points.opponent]);
    return battle;
  }

  async completeTask(code, visitorId, payload) {
    const taskId = cleanText(payload.taskId, '', 48);
    const dailyTask = getDailyRoomTask();
    if (!taskId || taskId !== dailyTask.id) throw Object.assign(new Error('今日任务已轮换，请刷新后重试'), { statusCode: 400 });
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const member = await client.query(`select m.member_id, m.room_id from jh_room_members m
        join jh_rooms r on r.room_id=m.room_id
        where r.code=$1 and r.status='active' and r.expires_at>now() and m.visitor_id=$2 for update`, [code, visitorId]);
      if (!member.rowCount) throw Object.assign(new Error('加入有效好友房后才能完成任务'), { statusCode: 403 });
      const row = member.rows[0];
      const inserted = await client.query(`insert into jh_room_task_attempts
        (attempt_id, room_id, member_id, visitor_id, task_date, task_id, points)
        values ($1,$2,$3,$4,(now() at time zone 'Asia/Shanghai')::date,$5,3)
        on conflict (room_id, visitor_id, task_date) do nothing returning attempt_id`,
      [randomUUID(), row.room_id, row.member_id, visitorId, taskId]);
      if (inserted.rowCount) await client.query('update jh_room_members set season_points=season_points+3, updated_at=now() where member_id=$1', [row.member_id]);
      await client.query('commit');
      return { completed: true, awarded: Boolean(inserted.rowCount), points: inserted.rowCount ? 3 : 0 };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async handle(req, res, url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)) {
    if (!url.pathname.startsWith('/api/social/')) return false;
    const { visitorId, cookies } = this.visitor(req);
    if (!this.enabled) {
      sendJson(res, 503, { error: '好友榜暂未启用，请配置 DATABASE_URL' }, cookies);
      return true;
    }
    if (!this.allow(req, `${req.method}:${url.pathname}`, req.method === 'GET' ? 120 : 30)) {
      sendJson(res, 429, { error: '操作太频繁，请稍后再试' }, cookies);
      return true;
    }
    try {
      const identityMatch = url.pathname.match(/^\/api\/social\/identity\/(recover|recovery|delete)$/);
      if (identityMatch) {
        if (req.method !== 'POST') throw Object.assign(new Error('不支持的请求方式'), { statusCode: 405 });
        if (identityMatch[1] === 'recover') {
          if (!this.allow(req, 'identity-recover-strict', 5, 15 * 60_000)) {
            sendJson(res, 429, { error: '恢复尝试过多，请 15 分钟后再试' }, cookies);
            return true;
          }
          const recovered = await this.recoverIdentity((await readJson(req)).recoveryCode);
          sendJson(res, 200, { recovered: true, nickname: recovered.nickname }, [cookie('jh_social', recovered.visitorId, req)]);
        } else if (identityMatch[1] === 'recovery') {
          sendJson(res, 200, await this.rotateRecovery(visitorId), cookies);
        } else {
          sendJson(res, 200, await this.deleteIdentity(visitorId), [`jh_social=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`]);
        }
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/api/social/session') {
        sendJson(res, 200, { enabled: true, ...(await this.session(visitorId)) }, cookies);
        return true;
      }
      if (req.method === 'POST' && url.pathname === '/api/social/rooms') {
        const payload = await readJson(req);
        const result = await this.createRoom(visitorId, payload);
        if (payload.roomType === 'league') void this.recordLeagueEvent(req, 'league_room_created', { roomType: 'league' });
        sendJson(res, 201, result, cookies);
        return true;
      }
      const leagueMatch = url.pathname.match(/^\/api\/social\/rooms\/([A-Z2-9]{6,10})\/league\/(submit|retry|vote|report|moderate|remove|next-season)$/i);
      if (leagueMatch) {
        if (req.method !== 'POST') throw Object.assign(new Error('不支持的请求方式'), { statusCode: 405 });
        const code = leagueMatch[1].toUpperCase();
        const action = leagueMatch[2];
        const payload = action === 'next-season' ? {} : await readJson(req);
        let result;
        if (action === 'submit') result = await this.submitLeagueAnswer(code, visitorId, payload);
        else if (action === 'retry') result = await this.retryLeagueJudgement(code, visitorId, payload);
        else if (action === 'vote') result = await this.voteLeagueAnswer(code, visitorId, payload);
        else if (action === 'report') result = await this.reportLeagueAnswer(code, visitorId, payload);
        else if (action === 'moderate') result = await this.moderateLeagueAnswer(code, visitorId, payload);
        else if (action === 'remove') result = await this.removeLeagueMember(code, visitorId, payload);
        else result = await this.startNextLeagueSeason(code, visitorId);
        const eventName = action === 'submit' ? 'league_submission_completed' : action === 'vote' ? 'league_vote_cast' : action === 'report' ? 'league_reported' : action === 'next-season' ? 'league_season_started' : null;
        if (eventName) void this.recordLeagueEvent(req, eventName, { roomType: 'league' });
        if (action === 'submit') void this.recordLeagueEvent(req, 'friend_completed', { roomType: 'league' });
        sendJson(res, 200, result, cookies);
        return true;
      }
      const match = url.pathname.match(/^\/api\/social\/rooms\/([A-Z2-9]{6,10})(?:\/(join|score|leave|close|pk|task))?$/i);
      if (!match) {
        sendJson(res, 404, { error: '好友榜接口不存在' }, cookies);
        return true;
      }
      const code = match[1].toUpperCase();
      if (!ROOM_CODE_RE.test(code)) throw Object.assign(new Error('房间码格式无效'), { statusCode: 400 });
      const action = match[2];
      if (req.method === 'GET' && !action) {
        sendJson(res, 200, await this.room(code, visitorId), cookies);
        return true;
      }
      if (req.method !== 'POST') throw Object.assign(new Error('不支持的请求方式'), { statusCode: 405 });
      const payload = ['join', 'score', 'pk', 'task'].includes(action) ? await readJson(req) : {};
      if (action === 'join') {
        const result = await this.joinRoom(code, visitorId, payload);
        if (result.firstJoin) void this.recordLeagueEvent(req, 'league_joined', { roomType: 'league' });
        sendJson(res, 200, result, cookies);
      }
      else if (action === 'score') sendJson(res, 200, await this.updateScore(code, visitorId, payload), cookies);
      else if (action === 'leave') sendJson(res, 200, await this.leaveRoom(code, visitorId), cookies);
      else if (action === 'close') sendJson(res, 200, await this.closeRoom(code, visitorId), cookies);
      else if (action === 'pk') sendJson(res, 200, await this.pk(code, visitorId, payload), cookies);
      else if (action === 'task') sendJson(res, 200, await this.completeTask(code, visitorId, payload), cookies);
      else throw Object.assign(new Error('好友榜操作不存在'), { statusCode: 404 });
      return true;
    } catch (error) {
      sendJson(res, Number(error.statusCode || 500), { error: cleanText(error.message, '好友榜服务暂时不可用', 120), ...(error.code ? { code: error.code } : {}) }, cookies);
      return true;
    }
  }
}
