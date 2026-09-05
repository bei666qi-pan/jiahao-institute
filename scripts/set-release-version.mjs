import { pathToFileURL } from 'node:url';

// Coolify's single-variable POST/PATCH preserves every other environment entry.
// https://coolify.io/docs/api-reference/api/applications/create-env-by-application-uuid
// https://coolify.io/docs/api-reference/api/applications/update-env-by-application-uuid
export async function ensureReleaseVersion({ baseUrl, appUuid, apiKey, targetSha }, fetchImpl = fetch) {
  if (!/^[a-f0-9]{40}$/.test(targetSha || '')) throw new Error('Invalid target SHA.');
  if (!baseUrl || !appUuid || !apiKey) throw new Error('Missing release configuration.');
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/v1/applications/${encodeURIComponent(appUuid)}/envs`;
  async function request(method, body) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method, redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error('Coolify release-variable request failed.'); }
    if (!response.ok) throw new Error(`Coolify release-variable request returned HTTP ${response.status}.`);
    if (method !== 'GET') return;
    try { return await response.json(); } catch { throw new Error('Invalid Coolify environment response.'); }
  }
  function productionRow(rows) {
    if (!Array.isArray(rows)) throw new Error('Invalid Coolify environment list.');
    const matches = rows.filter(row => row.key === 'APP_COMMIT_SHA' && row.is_preview !== true);
    if (matches.length > 1) throw new Error('Ambiguous production APP_COMMIT_SHA entries.');
    return matches[0];
  }
  const existing = productionRow(await request('GET'));
  if (existing && existing.is_runtime !== true) throw new Error('APP_COMMIT_SHA must be runtime-enabled.');
  if (existing?.value === targetSha) return;
  await request(existing ? 'PATCH' : 'POST', {
    key: 'APP_COMMIT_SHA', value: targetSha, is_preview: false, is_literal: true, is_multiline: false,
  });
  const verified = productionRow(await request('GET'));
  if (verified?.value !== targetSha || verified?.is_runtime !== true) {
    throw new Error('APP_COMMIT_SHA runtime verification failed.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await ensureReleaseVersion({ baseUrl: process.env.COOLIFY_BASE_URL, appUuid: process.env.COOLIFY_APP_UUID,
      apiKey: process.env.COOLIFY_API_KEY, targetSha: process.env.TARGET_SHA });
    console.log('Production APP_COMMIT_SHA matches the target release and is runtime-enabled.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
