const ACTIVE_WINDOW_MS = 60_000;
const HEARTBEAT_MS = 15_000;

function post(path, body, keepalive = false) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive,
    body: JSON.stringify(body),
  }).catch(() => null);
}

export function createTelemetryTransport(send = post) {
  let sessionReady = Promise.resolve(null);
  return {
    recordSession(body) {
      sessionReady = Promise.resolve(send('/api/telemetry/session', body)).catch(() => null);
      return sessionReady;
    },
    recordEvent(body) {
      return sessionReady.then(() => send('/api/telemetry/event', body)).catch(() => null);
    },
  };
}

const transport = createTelemetryTransport();

export function trackProductEvent(name, properties = {}) {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/admin')) return;
  const safeName = String(name || '').trim().slice(0, 48);
  if (!safeName) return;
  void transport.recordEvent({ name: safeName, properties });
}

export function startTelemetry() {
  if (window.location.pathname.startsWith('/admin')) return () => {};
  let lastActiveAt = Date.now();
  let lastPath = `${window.location.pathname}${window.location.search}`;
  const markActive = () => { lastActiveAt = Date.now(); };
  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
  events.forEach((name) => window.addEventListener(name, markActive, { passive: true }));

  const recordPage = () => transport.recordSession({ path: `${window.location.pathname}${window.location.search}`, referrer: document.referrer });
  void recordPage();

  const routeTimer = window.setInterval(() => {
    const path = `${window.location.pathname}${window.location.search}`;
    if (path !== lastPath && !path.startsWith('/admin')) {
      lastPath = path;
      void recordPage();
    }
  }, 1000);

  const heartbeat = window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastActiveAt <= ACTIVE_WINDOW_MS) {
      void post('/api/telemetry/heartbeat', {}, true);
    }
  }, HEARTBEAT_MS);

  return () => {
    events.forEach((name) => window.removeEventListener(name, markActive));
    window.clearInterval(routeTimer);
    window.clearInterval(heartbeat);
  };
}
