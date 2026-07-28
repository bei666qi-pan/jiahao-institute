import crypto from 'node:crypto';

const ECS_HOST = 'open.volcengineapi.com';
const ECS_SERVICE = 'ecs';
const ECS_VERSION = '2020-04-01';

function requiredEnv(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest();
}

function encodeQuery(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function createSignedEcsRequest({ action, method = 'GET', body = {}, query = {}, env = process.env, now = new Date() }) {
  const accessKey = requiredEnv('VOLC_AK', env);
  const secretKey = requiredEnv('VOLC_SK', env);
  const region = requiredEnv('VOLC_REGION', env);
  const payload = method === 'POST' ? JSON.stringify(body) : '';
  const parameters = { Action: action, Version: ECS_VERSION, ...query };
  const canonicalQuery = Object.keys(parameters)
    .sort()
    .map((key) => `${encodeQuery(key)}=${encodeQuery(String(parameters[key]))}`)
    .join('&');
  const xDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const shortDate = xDate.slice(0, 8);
  const payloadHash = sha256(payload);
  const contentTypeHeader = method === 'POST' ? 'content-type:application/json\n' : '';
  const canonicalHeaders = `${contentTypeHeader}host:${ECS_HOST}\nx-content-sha256:${payloadHash}\nx-date:${xDate}\n`;
  const signedHeaders = `${method === 'POST' ? 'content-type;' : ''}host;x-content-sha256;x-date`;
  const canonicalRequest = [method, '/', canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${shortDate}/${region}/${ECS_SERVICE}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(Buffer.from(secretKey), shortDate), region), ECS_SERVICE), 'request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const headers = {
    Host: ECS_HOST,
    'X-Date': xDate,
    'X-Content-Sha256': payloadHash,
    Authorization: `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  return {
    url: `https://${ECS_HOST}/?${canonicalQuery}`,
    options: { method, headers, ...(method === 'POST' ? { body: payload } : {}) },
  };
}

async function ecsRequest(input, fetchImpl = fetch, env = process.env) {
  input.env = env;
  const request = createSignedEcsRequest(input);
  const response = await fetchImpl(request.url, request.options);
  const data = await response.json();
  if (!response.ok || data.ResponseMetadata?.Error) {
    const error = data.ResponseMetadata?.Error;
    throw new Error(`Volcengine ${input.action} failed: ${error?.Code || response.status} ${error?.Message || ''}`.trim());
  }
  return data;
}

export async function describeInstance(instanceId, fetchImpl = fetch, env = process.env) {
  const data = await ecsRequest({
    action: 'DescribeInstances',
    query: { 'InstanceIds.1': instanceId },
  }, fetchImpl, env);
  const instance = data.Result?.Instances?.[0];
  if (!instance) throw new Error(`ECS instance not found: ${instanceId}`);
  return {
    instanceId: instance.InstanceId,
    instanceName: instance.InstanceName,
    status: instance.Status,
    updatedAt: instance.UpdatedAt,
  };
}

export async function rebootInstance(instanceId, {
  fetchImpl = fetch,
  cooldownMinutes = 20,
  now = new Date(),
  env = process.env,
} = {}) {
  const instance = await describeInstance(instanceId, fetchImpl, env);
  const updatedAt = Date.parse(instance.updatedAt);
  const ageMinutes = Number.isFinite(updatedAt) ? (now.getTime() - updatedAt) / 60_000 : Infinity;
  if (ageMinutes < cooldownMinutes) {
    throw new Error(`Refusing to reboot ${instanceId}: instance changed ${ageMinutes.toFixed(1)} minutes ago (cooldown ${cooldownMinutes}m)`);
  }
  if (instance.status !== 'RUNNING') {
    throw new Error(`Refusing to reboot ${instanceId}: current status is ${instance.status}`);
  }
  await ecsRequest({
    action: 'RebootInstances',
    method: 'POST',
    body: { InstanceIds: [instanceId] },
  }, fetchImpl, env);
  return instance;
}

async function main() {
  const command = process.argv[2];
  const instanceId = requiredEnv('VOLC_INSTANCE_ID');
  if (command === 'describe') {
    console.log(JSON.stringify(await describeInstance(instanceId)));
    return;
  }
  if (command === 'reboot') {
    const instance = await rebootInstance(instanceId);
    console.log(`Reboot requested for ${instance.instanceName} (${instance.instanceId}).`);
    return;
  }
  throw new Error('Usage: node scripts/volcengine-ecs-control.mjs <describe|reboot>');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
