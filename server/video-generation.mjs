import { createHash, randomUUID } from 'node:crypto';

const CHARACTERS = new Set(['nailoong', 'jiahao']);
const RATIOS = new Set(['1:1', '3:4', '16:9']);
const TERMINAL = new Set(['succeeded', 'failed', 'expired']);
const SCENES = {
  editorial: '暖白摄影棚、档案照构图、克制留白',
  cinematic: '雨夜电影感、潮湿街道、冷灰环境光',
  prank: '朋友整活现场、荒诞但友善、自然抓拍',
  awkward: '大型社死现场、所有人都沉默、一本正经的荒诞镜头',
};

export class VideoGenerationError extends Error {
  constructor(message, { statusCode = 503, code = 'VIDEO_PROVIDER_FAILED', activeTaskId = null } = {}) {
    super(message);
    this.name = 'VideoGenerationError';
    this.statusCode = statusCode;
    this.code = code;
    this.activeTaskId = activeTaskId;
  }
}

export function normalizeVideoRequest(payload = {}) {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim().slice(0, 500) : '';
  if (prompt.length < 2) throw new VideoGenerationError('至少输入两个字', { statusCode: 400, code: 'INVALID_PROMPT' });
  return {
    character: CHARACTERS.has(payload.character) ? payload.character : 'nailoong',
    prompt,
    scene: Object.hasOwn(SCENES, payload.scene) ? payload.scene : 'cinematic',
    aspectRatio: RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : '1:1',
  };
}

export function buildVideoPrompt(userPrompt, scene = 'cinematic', character = 'nailoong') {
  const direction = SCENES[scene] || SCENES.cinematic;
  if (character === 'jiahao') return `参考图片中的嘉豪参考人物是唯一主角。严格保持同一人的脸型、发型、身材比例和整体气质，不得换人、卡通化或怪物化。动作自然，镜头克制有电影感，人物全程清晰稳定。场景方向：${direction}，加入少量电蓝视觉线索。情节：${userPrompt}。不要出现文字、品牌标志或界面。`;
  return `参考图片中的浅黄色软体玩偶是唯一主角。全程保持相同的圆胖豆包身体、光滑头顶、米白椭圆肚皮、两只浅绿色圆盘眼睛、闭合水平细线微笑和灰褐色圆润手脚。动作缓慢自然，外形和材质连续稳定，氛围友善柔和。场景：${direction}。情节：${userPrompt}。画面干净，不放置文字、品牌标志或界面。`;
}

export function shanghaiQuotaWindow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  const value = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const nextLocalMidnight = new Date(`${value}T16:00:00.000Z`);
  if (date >= nextLocalMidnight) nextLocalMidnight.setUTCDate(nextLocalMidnight.getUTCDate() + 1);
  return { date: value, resetAt: nextLocalMidnight.toISOString() };
}

function minimaxFailure(status, data = {}) {
  const providerCode = Number(data?.base_resp?.status_code || data?.error?.code || 0);
  if (status === 429 || status === 402 || [1002, 1008, 1041, 2045, 2056].includes(providerCode)) {
    return new VideoGenerationError('今日使用人数过多，暂不支持生成', {
      statusCode: 503,
      code: 'PROVIDER_CAPACITY_EXHAUSTED',
    });
  }
  if ([1026, 1027].includes(providerCode)) {
    return new VideoGenerationError('视频描述或参考素材未通过校验，请换个友善的说法', {
      statusCode: 400,
      code: 'INVALID_CONTENT',
    });
  }
  if (status === 401 || status === 403 || [1004, 2049].includes(providerCode)) {
    return new VideoGenerationError('视频生成服务暂时不可用', { code: 'AUTHENTICATION_FAILED' });
  }
  return new VideoGenerationError('视频生成服务暂时不可用', {
    code: providerCode === 1001 ? 'TIMEOUT' : 'VIDEO_PROVIDER_FAILED',
  });
}

async function minimaxRequest(url, key, init, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || Number(data?.base_resp?.status_code || 0) !== 0) throw minimaxFailure(response.status, data);
    return data;
  } catch (error) {
    if (error instanceof VideoGenerationError) throw error;
    throw new VideoGenerationError('视频生成服务暂时不可用', {
      code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createMinimaxVideoProvider(config, fetchImpl = fetch) {
  const withQuery = (base, name, value) => {
    const url = new URL(base);
    url.searchParams.set(name, value);
    return url.toString();
  };
  return {
    async create(request) {
      if (!config?.key) throw new VideoGenerationError('视频生成服务尚未配置', { code: 'NOT_CONFIGURED' });
      if (typeof config.createFirstFrame !== 'function') {
        throw new VideoGenerationError('角色视频首帧服务尚未配置', { code: 'REFERENCE_NOT_CONFIGURED' });
      }
      const firstFrame = await config.createFirstFrame(request);
      if (!firstFrame) throw new VideoGenerationError('角色视频首帧生成失败', { code: 'EMPTY_FIRST_FRAME' });
      const data = await minimaxRequest(config.url, config.key, {
        method: 'POST',
        body: JSON.stringify({
          model: config.model,
          prompt: buildVideoPrompt(request.prompt, request.scene, request.character),
          first_frame_image: firstFrame,
          duration: 6,
          resolution: '768P',
          prompt_optimizer: true,
          aigc_watermark: true,
        }),
      }, fetchImpl);
      if (!data?.task_id) throw new VideoGenerationError('视频服务没有返回任务编号', { code: 'EMPTY_TASK' });
      return { id: String(data.task_id) };
    },
    async get(providerTaskId) {
      const data = await minimaxRequest(withQuery(config.queryUrl, 'task_id', providerTaskId), config.key, { method: 'GET' }, fetchImpl);
      const raw = String(data?.status || '').toLowerCase();
      const status = raw === 'success' ? 'succeeded'
        : raw === 'fail' ? 'failed'
          : raw === 'processing' ? 'running'
            : ['preparing', 'queueing'].includes(raw) ? 'queued' : 'running';
      if (status !== 'succeeded') {
        return {
          status,
          videoUrl: null,
          errorCode: status === 'failed' ? String(data?.base_resp?.status_code || 'PROVIDER_FAILED').slice(0, 64).toUpperCase() : null,
        };
      }
      if (!data?.file_id) throw new VideoGenerationError('视频服务没有返回成片编号', { code: 'EMPTY_FILE' });
      const file = await minimaxRequest(withQuery(config.fileUrl, 'file_id', data.file_id), config.key, { method: 'GET' }, fetchImpl);
      const videoUrl = file?.file?.download_url;
      if (!videoUrl) throw new VideoGenerationError('视频服务没有返回可播放成片', { code: 'EMPTY_VIDEO' });
      return { status, videoUrl, errorCode: null };
    },
  };
}

function publicTask(task, quota) {
  return {
    id: task.id, character: task.character, mediaType: 'video', status: task.status,
    aspectRatio: task.aspectRatio, videoUrl: task.videoUrl || null,
    message: task.status === 'failed' ? '这段视频没有生成出来，明天可以再试一次。' : task.status === 'expired' ? '视频任务已超时。' : '',
    quota,
  };
}

export function createVideoGenerationService({ store, provider, enabled = true, unavailableMessage = '当前套餐不支持视频生成', now = () => new Date(), id = randomUUID, hashVisitor = (value) => createHash('sha256').update(value).digest('hex') }) {
  const assertAvailable = () => {
    if (!enabled) throw new VideoGenerationError(unavailableMessage, { statusCode: 503, code: 'VIDEO_PLAN_UNAVAILABLE' });
  };
  const quota = async (visitorId) => {
    assertAvailable();
    const window = shanghaiQuotaWindow(now());
    const current = await store.quota(visitorId, window.date);
    return { limit: 1, used: current.used, remaining: Math.max(0, 1 - current.used), resetAt: window.resetAt, activeTaskId: current.activeTaskId || null };
  };
  return {
    quota,
    async create(visitorId, payload) {
      assertAvailable();
      const request = normalizeVideoRequest(payload);
      const window = shanghaiQuotaWindow(now());
      const task = { id: id(), visitorId, quotaDate: window.date, character: request.character, aspectRatio: request.aspectRatio, status: 'submitting' };
      if (!(await store.reserve(task))) {
        const current = await quota(visitorId);
        throw new VideoGenerationError('今天的视频额度已经用完', { statusCode: 429, code: 'DAILY_QUOTA_EXHAUSTED', activeTaskId: current.activeTaskId });
      }
      let created;
      try {
        created = await provider.create(request, hashVisitor(visitorId));
      } catch (error) {
        await store.release(task.id);
        if (error instanceof VideoGenerationError) throw error;
        throw new VideoGenerationError('视频服务暂时不可用', { code: 'VIDEO_PROVIDER_FAILED' });
      }
      try {
        await store.attachProviderTask(task.id, created.id);
      } catch {
        throw new VideoGenerationError('视频任务已提交，但状态同步暂时不可用', { code: 'VIDEO_TASK_SYNC_FAILED' });
      }
      const current = await store.findOwned(task.id, visitorId);
      return publicTask(current, await quota(visitorId));
    },
    async status(taskId, visitorId) {
      let task = await store.findOwned(taskId, visitorId);
      if (!task) throw new VideoGenerationError('视频任务不存在', { statusCode: 404, code: 'TASK_NOT_FOUND' });
      if (!TERMINAL.has(task.status) && task.providerTaskId) {
        const latest = await provider.get(task.providerTaskId);
        try {
          task = await store.update(task.id, latest);
        } catch {
          task = { ...task, ...latest };
        }
      }
      return publicTask(task, await quota(visitorId));
    },
  };
}

export class PostgresVideoGenerationStore {
  constructor(pool) { this.pool = pool; }
  async quota(visitorId, day) {
    const result = await this.pool.query(`select generation_id, status from jh_video_generations where visitor_id=$1 and quota_date=$2 limit 1`, [visitorId, day]);
    const row = result.rows[0];
    return { used: row ? 1 : 0, activeTaskId: row && !TERMINAL.has(row.status) ? row.generation_id : null };
  }
  async reserve(task) {
    const result = await this.pool.query(`insert into jh_video_generations (generation_id, visitor_id, quota_date, character, aspect_ratio, status)
      values ($1,$2,$3,$4,$5,$6) on conflict (visitor_id, quota_date) do nothing returning generation_id`,
    [task.id, task.visitorId, task.quotaDate, task.character, task.aspectRatio, task.status]);
    return result.rowCount > 0;
  }
  async attachProviderTask(id, providerTaskId) {
    await this.pool.query(`update jh_video_generations set provider_task_id=$2, status='queued', updated_at=now() where generation_id=$1`, [id, providerTaskId]);
  }
  async release(id) { await this.pool.query(`delete from jh_video_generations where generation_id=$1 and provider_task_id is null`, [id]); }
  async findOwned(id, visitorId) {
    const result = await this.pool.query(`select generation_id, visitor_id, provider_task_id, character, aspect_ratio, status, video_url, error_code
      from jh_video_generations where generation_id=$1 and visitor_id=$2`, [id, visitorId]);
    const row = result.rows[0];
    return row ? { id: row.generation_id, visitorId: row.visitor_id, providerTaskId: row.provider_task_id, character: row.character, aspectRatio: row.aspect_ratio, status: row.status, videoUrl: row.video_url, errorCode: row.error_code } : null;
  }
  async update(id, values) {
    const result = await this.pool.query(`update jh_video_generations set status=$2, video_url=$3, error_code=$4, updated_at=now(), completed_at=case when $2 in ('succeeded','failed','expired') then now() else completed_at end
      where generation_id=$1 returning generation_id, visitor_id, provider_task_id, character, aspect_ratio, status, video_url, error_code`,
    [id, values.status, values.videoUrl || null, values.errorCode || null]);
    const row = result.rows[0];
    return { id: row.generation_id, visitorId: row.visitor_id, providerTaskId: row.provider_task_id, character: row.character, aspectRatio: row.aspect_ratio, status: row.status, videoUrl: row.video_url, errorCode: row.error_code };
  }
}
