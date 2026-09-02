const INITIAL_SNAPSHOT = Object.freeze({
  status: 'idle',
  input: null,
  result: null,
  message: '',
  startedAt: null,
  completedAt: null,
});

export const IMAGE_GENERATION_REQUEST_TIMEOUT_MS = 240_000;

export function createImageGenerationTask(request) {
  if (typeof request !== 'function') throw new TypeError('request must be a function');
  let snapshot = INITIAL_SNAPSHOT;
  let currentPromise = null;
  const listeners = new Set();
  const emit = (next) => {
    snapshot = Object.freeze(next);
    listeners.forEach((listener) => listener());
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(input) {
      if (snapshot.status === 'running' && currentPromise) return currentPromise;
      const startedAt = Date.now();
      emit({ status: 'running', input: { ...input }, result: null, message: '', startedAt, completedAt: null });
      let requested;
      try { requested = request(input); }
      catch (error) { requested = Promise.reject(error); }
      currentPromise = Promise.resolve(requested)
        .then((result) => {
          emit({ status: 'complete', input: { ...input }, result, message: '', startedAt, completedAt: Date.now() });
          return result;
        })
        .catch((error) => {
          emit({ status: 'error', input: { ...input }, result: null, message: String(error?.message || error || '生成失败'), startedAt, completedAt: Date.now() });
          throw error;
        })
        .finally(() => { currentPromise = null; });
      return currentPromise;
    },
    dismiss() {
      if (snapshot.status !== 'running') emit(INITIAL_SNAPSHOT);
    },
  };
}
