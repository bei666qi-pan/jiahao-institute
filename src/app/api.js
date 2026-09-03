export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || '服务暂时不可用，请稍后再试');
    error.status = response.status;
    error.code = payload.code;
    error.activeTaskId = payload.activeTaskId;
    throw error;
  }
  return payload;
}

export function postJson(path, body, options = {}) {
  return apiRequest(path, { ...options, method: 'POST', body: JSON.stringify(body) });
}

export function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
