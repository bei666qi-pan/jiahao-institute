import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ensureReleaseVersion } from '../../scripts/set-release-version.mjs';

const sha = 'a'.repeat(40);
const config = { baseUrl: 'https://coolify.example', appUuid: 'app-1', apiKey: 'private-test-token', targetSha: sha };
function mock(initial, final, failWrite = false) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    if (options.method === 'GET') return new Response(JSON.stringify(calls.length === 1 ? initial : final));
    return new Response(failWrite ? 'private-server-response' : '{}', { status: failWrite ? 500 : 201 });
  };
  return { calls, fetchImpl };
}
const row = (value = sha, more = {}) => ({ key: 'APP_COMMIT_SHA', value, is_preview: false, is_runtime: true, ...more });

test('release identity creates only the production SHA and verifies readback', async () => {
  const m = mock([{ key: 'DATABASE_URL', value: 'secret' }, row('preview-value', { is_preview: true })], [row()]);
  await ensureReleaseVersion(config, m.fetchImpl);
  assert.deepEqual(m.calls.map(x => x.method), ['GET', 'POST', 'GET']);
  assert.deepEqual(JSON.parse(m.calls[1].body), { key: 'APP_COMMIT_SHA', value: sha, is_preview: false, is_literal: true, is_multiline: false });
  assert.ok(m.calls.every(x => x.url === 'https://coolify.example/api/v1/applications/app-1/envs'));
});

test('release identity updates only the existing production SHA', async () => {
  const m = mock([row('b'.repeat(40))], [row()]);
  await ensureReleaseVersion(config, m.fetchImpl);
  assert.deepEqual(m.calls.map(x => x.method), ['GET', 'PATCH', 'GET']);
});

test('matching runtime SHA needs no write', async () => {
  const m = mock([row()], []);
  await ensureReleaseVersion(config, m.fetchImpl);
  assert.equal(m.calls.length, 1);
});

test('invalid SHA and duplicate or non-runtime variables stop before any write', async () => {
  const invalid = mock([], []);
  await assert.rejects(ensureReleaseVersion({ ...config, targetSha: 'main' }, invalid.fetchImpl), /target SHA/);
  assert.equal(invalid.calls.length, 0);
  for (const rows of [[row(), row()], [row(sha, { is_runtime: false })]]) {
    const m = mock(rows, []);
    await assert.rejects(ensureReleaseVersion(config, m.fetchImpl));
    assert.equal(m.calls.length, 1);
  }
});

test('write failure and stale readback fail without exposing response or credentials', async () => {
  const failure = mock([], [], true);
  await assert.rejects(ensureReleaseVersion(config, failure.fetchImpl), e => !e.message.includes('private') && /HTTP 500/.test(e.message));
  for (const final of [[], [row('b'.repeat(40))], [row(sha, { is_runtime: false })]]) {
    const m = mock([], final);
    await assert.rejects(ensureReleaseVersion(config, m.fetchImpl), /verification/);
  }
});

test('public release gate rejects a stale or missing commit even when service version matches', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-production.yml', import.meta.url), 'utf8');
  const expression = workflow.match(/'(.status == "ok" and .quoteServiceVersion[^']+)'/)[1];
  for (const [commitSha, expected] of [[sha, 0], ['b'.repeat(40), 1], [undefined, 1]]) {
    const result = spawnSync('jq', ['-e', '--argjson', 'version', '6', '--arg', 'sha', sha, expression], { input: JSON.stringify({ status: 'ok', quoteServiceVersion: 6, commitSha }), encoding: 'utf8' });
    assert.equal(result.status, expected);
  }
  assert.ok(workflow.indexOf('node scripts/set-release-version.mjs') < workflow.indexOf('- name: Trigger Coolify deployment'));
});
