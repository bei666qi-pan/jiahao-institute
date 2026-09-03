const STORAGE_KEY = 'jiahao-media-task-v1';
const TERMINAL = new Set(['succeeded', 'failed', 'expired']);

const INITIAL = Object.freeze({
  status: 'idle', mediaType: null, character: null, input: null, result: null,
  message: '', startedAt: null, completedAt: null,
});

function savedTask(result) {
  return JSON.stringify({
    version: 1, id: result.id, mediaType: 'video', character: result.character,
    aspectRatio: result.aspectRatio,
  });
}

export function createMediaGenerationTask({
  generateImage,
  createVideo,
  getVideoTask,
  storage = globalThis.localStorage,
  documentRef = globalThis.document,
  schedule = globalThis.setTimeout,
  cancel = globalThis.clearTimeout,
} = {}) {
  let snapshot = INITIAL;
  let currentPromise = null;
  let timer = null;
  const listeners = new Set();
  const emit = (next) => {
    snapshot = Object.freeze(next);
    listeners.forEach((listener) => listener());
  };
  const clearTimer = () => { if (timer !== null) cancel(timer); timer = null; };
  const persist = (result) => { try { storage?.setItem(STORAGE_KEY, savedTask(result)); } catch { /* storage is optional */ } };
  const forget = () => { try { storage?.removeItem(STORAGE_KEY); } catch { /* storage is optional */ } };

  const applyVideo = async (result, startedAt = snapshot.startedAt || Date.now()) => {
    if (TERMINAL.has(result.status)) {
      clearTimer();
      forget();
      if (result.status === 'succeeded') {
        emit({ ...snapshot, status: 'finalizing', mediaType: 'video', character: result.character, result, message: '', startedAt });
        await Promise.resolve();
        emit({ ...snapshot, status: 'succeeded', mediaType: 'video', character: result.character, result, message: '', startedAt, completedAt: Date.now() });
      } else {
        emit({ ...snapshot, status: 'failed', mediaType: 'video', character: result.character, result, message: result.message || '这段视频没有生成出来。', startedAt, completedAt: Date.now() });
      }
      return result;
    }
    persist(result);
    emit({ ...snapshot, status: result.status === 'queued' ? 'queued' : 'running', mediaType: 'video', character: result.character, result, message: '', startedAt, completedAt: null });
    clearTimer();
    timer = schedule(poll, documentRef?.hidden ? 15_000 : 5_000);
    return result;
  };

  const poll = async () => {
    const id = snapshot.result?.id;
    if (!id || typeof getVideoTask !== 'function') return;
    try { await applyVideo(await getVideoTask(id)); }
    catch (error) {
      clearTimer();
      emit({ ...snapshot, status: 'failed', message: String(error?.message || '视频状态查询失败'), completedAt: Date.now() });
    }
  };

  const onVisibilityChange = () => {
    if (snapshot.mediaType === 'video' && ['queued', 'running'].includes(snapshot.status)) {
      clearTimer();
      timer = schedule(poll, documentRef?.hidden ? 15_000 : 5_000);
    }
  };
  documentRef?.addEventListener?.('visibilitychange', onVisibilityChange);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start(input) {
      if (['submitting', 'queued', 'running', 'finalizing'].includes(snapshot.status)) return currentPromise || Promise.resolve(snapshot.result);
      const mediaType = input.mediaType === 'video' ? 'video' : 'image';
      const startedAt = Date.now();
      emit({ status: 'submitting', mediaType, character: input.character || 'nailoong', input: { ...input }, result: null, message: '', startedAt, completedAt: null });
      currentPromise = (async () => {
        try {
          if (mediaType === 'video') return await applyVideo(await createVideo(input), startedAt);
          emit({ ...snapshot, status: 'running' });
          const result = await generateImage(input);
          emit({ ...snapshot, status: 'finalizing', result });
          await Promise.resolve();
          emit({ ...snapshot, status: 'succeeded', character: result.character || input.character, result, completedAt: Date.now() });
          return result;
        } catch (error) {
          const exhausted = error?.status === 429 || error?.code === 'DAILY_QUOTA_EXHAUSTED';
          emit({ ...snapshot, status: exhausted ? 'exhausted' : 'failed', message: String(error?.message || '生成失败'), completedAt: Date.now() });
          throw error;
        } finally { currentPromise = null; }
      })();
      return currentPromise;
    },
    async restore() {
      let saved;
      try { saved = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null'); } catch { forget(); return null; }
      if (saved?.version !== 1 || saved.mediaType !== 'video' || !saved.id || typeof getVideoTask !== 'function') return null;
      const seed = { id: saved.id, mediaType: 'video', character: saved.character || 'nailoong', aspectRatio: saved.aspectRatio || '1:1', status: 'queued' };
      emit({ status: 'queued', mediaType: 'video', character: seed.character, input: null, result: seed, message: '', startedAt: Date.now(), completedAt: null });
      try { return await applyVideo(await getVideoTask(saved.id)); }
      catch { forget(); emit(INITIAL); return null; }
    },
    dismiss() { if (!['submitting', 'queued', 'running', 'finalizing'].includes(snapshot.status)) emit(INITIAL); },
    destroy() { clearTimer(); documentRef?.removeEventListener?.('visibilitychange', onVisibilityChange); },
  };
}

export { STORAGE_KEY as MEDIA_TASK_STORAGE_KEY };
