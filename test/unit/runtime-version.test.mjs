import test from 'node:test';
import assert from 'node:assert/strict';
import { publicRuntimeVersion } from '../../server/runtime-version.mjs';

test('public version reports only explicitly injected release identifiers', () => {
  const sha = 'a'.repeat(40);
  assert.deepEqual(publicRuntimeVersion({ APP_COMMIT_SHA: sha, APP_VERSION: 'release-1.2.3' }), { commitSha: sha, appVersion: 'release-1.2.3' });
  assert.deepEqual(publicRuntimeVersion({ APP_VERSION: 'release-1.2.3' }), { commitSha: null, appVersion: 'release-1.2.3' });
  assert.deepEqual(publicRuntimeVersion({}), { commitSha: null, appVersion: null });
});

test('public version rejects malformed values and never exposes unrelated environment secrets', () => {
  assert.deepEqual(publicRuntimeVersion({ APP_COMMIT_SHA: 'not-a-sha', APP_VERSION: 'https://user:secret@example.com', DATABASE_URL: 'secret', API_KEY: 'secret' }), { commitSha: null, appVersion: null });
  assert.deepEqual(publicRuntimeVersion({ APP_COMMIT_SHA: 'a'.repeat(39), APP_VERSION: 'x'.repeat(81) }), { commitSha: null, appVersion: null });
});
