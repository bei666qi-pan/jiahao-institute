// Local-only player adapter. Prints visible game state, never cookies or continuation tokens.
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const [action, sessionPath, ...words] = process.argv.slice(2);
if (!sessionPath || !['start', 'say', 'end', 'look', 'retry'].includes(action)) {
  console.error('Usage: node scripts/scene-playtest.mjs start|say|end|look|retry /tmp/session.json [sceneId or player words]');
  process.exit(2);
}
const base = process.env.PLAYTEST_URL || 'http://127.0.0.1:5190';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('This adapter only accepts an isolated local server');
await mkdir(dirname(sessionPath), { recursive: true });
let state = action === 'start' ? { base, cookie: '', sceneId: words[0] || 'wrong-group' } : JSON.parse(await readFile(sessionPath, 'utf8'));
if (state.base !== base) throw new Error('Session belongs to another local server');
const save = () => writeFile(sessionPath, JSON.stringify(state), { mode: 0o600 });
const visible = () => ({ scene: state.scene, turn: state.result?.turn || 0, status: state.result?.status || 'playing', turns: state.result?.turns || [], ending: state.result?.ending || null, angles: state.result?.angles || state.scene?.angles || [], pending: Boolean(state.pending), sceneFacts: state.result?.sceneFacts || state.scene?.initialFacts || [] });
async function request(path, body) {
  const started = Date.now();
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie: state.cookie, origin: base }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(32_000) });
  const cookies = new Map(state.cookie.split('; ').filter(Boolean).map(x => { const at=x.indexOf('=');return [x.slice(0,at),x.slice(at+1)]; }));
  for (const cookie of response.headers.getSetCookie()) { const first=cookie.split(';')[0], at=first.indexOf('=');cookies.set(first.slice(0,at),first.slice(at+1)); }
  state.cookie = [...cookies].map(([k,v]) => `${k}=${v}`).join('; ');
  return { status: response.status, ms: Date.now() - started, body: await response.json() };
}
try {
  if (action === 'start') {
    const response = await request('/api/scenes');
    state.scene = response.body.scenes?.find(scene => scene.id === state.sceneId);
    if (!state.scene) throw new Error(response.body.error || 'Scene unavailable');
  } else if (action !== 'look') {
    if (action !== 'retry') {
      if (state.pending) throw new Error('A request is unresolved; use retry or inspect the UI before a new action');
      state.pending = { sceneId: state.sceneId, input: words.join(' '), ...(state.result?.token ? { token: state.result.token } : {}), idempotencyKey: randomUUID(), ...(action === 'end' ? { action: 'end' } : {}) };
      await save();
    }
    if (!state.pending) throw new Error('No pending request');
    if (action === 'retry' && state.pending.retryable) {
      state.pending.idempotencyKey = randomUUID();
      delete state.pending.retryable;
      await save();
    }
    const response = await request('/api/scenes/turn', state.pending);
    const event = { at: new Date().toISOString(), action, input: state.pending.input, httpStatus: response.status, ms: response.ms };
    if (response.status < 300) { state.result = response.body;state.pending = null; }
    else { event.error = response.body.error;event.code=response.body.code;state.pending.retryable=response.body.retryable===true; }
    await appendFile(sessionPath + '.visible.jsonl', JSON.stringify({ ...event, ...visible() }) + '\n', { mode: 0o600 });
    if (response.status >= 300) { await save(); console.log(JSON.stringify({ ...event, ...visible() }, null, 2));process.exit(1); }
  }
  await save();console.log(JSON.stringify(visible(), null, 2));
} catch(error) { await save();console.error(JSON.stringify({error:error.message,pending:Boolean(state.pending)}));process.exitCode=1; }
