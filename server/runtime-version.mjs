// Only explicit, bounded release identifiers belong in the public health payload.
export function publicRuntimeVersion(env = process.env) {
  const sha = env.APP_COMMIT_SHA;
  const version = env.APP_VERSION;
  return {
    commitSha: typeof sha === 'string' && /^[a-f0-9]{40}$/i.test(sha) ? sha : null,
    appVersion: typeof version === 'string' && /^[a-z0-9][a-z0-9._+-]{0,79}$/i.test(version) ? version : null,
  };
}
