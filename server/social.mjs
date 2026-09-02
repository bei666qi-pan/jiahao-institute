import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { parseCookies } from './observability.mjs';

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
  constructor(env = process.env, signingSecret = '') {
    this.enabled = Boolean(env.DATABASE_URL);
    this.signingSecret = signingSecret;
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

  async session(visitorId) {
    const rooms = await this.query(`select r.code, r.name, r.room_type, r.status, r.expires_at,
      (r.owner_visitor_id = $1) as is_owner, m.score, m.level,
      (select count(*)::int from jh_room_members x where x.room_id = r.room_id) as member_count
      from jh_room_members m join jh_rooms r on r.room_id = m.room_id
      where m.visitor_id = $1 order by m.joined_at desc limit 20`, [visitorId]);
    const profile = await this.query('select nickname from jh_social_profiles where visitor_id = $1', [visitorId]);
    return { nickname: profile.rows[0]?.nickname || '', rooms: rooms.rows };
  }

  async room(code, visitorId) {
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
      if (req.method === 'GET' && url.pathname === '/api/social/session') {
        sendJson(res, 200, { enabled: true, ...(await this.session(visitorId)) }, cookies);
        return true;
      }
      if (req.method === 'POST' && url.pathname === '/api/social/rooms') {
        const result = await this.createRoom(visitorId, await readJson(req));
        sendJson(res, 201, result, cookies);
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
      if (action === 'join') sendJson(res, 200, await this.joinRoom(code, visitorId, payload), cookies);
      else if (action === 'score') sendJson(res, 200, await this.updateScore(code, visitorId, payload), cookies);
      else if (action === 'leave') sendJson(res, 200, await this.leaveRoom(code, visitorId), cookies);
      else if (action === 'close') sendJson(res, 200, await this.closeRoom(code, visitorId), cookies);
      else if (action === 'pk') sendJson(res, 200, await this.pk(code, visitorId, payload), cookies);
      else if (action === 'task') sendJson(res, 200, await this.completeTask(code, visitorId, payload), cookies);
      else throw Object.assign(new Error('好友榜操作不存在'), { statusCode: 404 });
      return true;
    } catch (error) {
      sendJson(res, Number(error.statusCode || 500), { error: cleanText(error.message, '好友榜服务暂时不可用', 120) }, cookies);
      return true;
    }
  }
}
