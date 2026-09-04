const ALLOWED_RATIOS = new Set(['1:1', '3:4', '16:9']);
const ALLOWED_CHARACTERS = new Set(['nailoong', 'jiahao']);
export const IMAGE_PROVIDER_TIMEOUTS = Object.freeze({ volcengine: 90_000 });
const SIZE_BY_RATIO = { '1:1': '2048x2048', '3:4': '1728x2304', '16:9': '2560x1440' };
const SCENES = {
  editorial: '暖白摄影棚、档案照构图、克制留白',
  cinematic: '雨夜电影感、潮湿街道、冷灰环境光',
  prank: '朋友整活现场、荒诞但友善、抓拍构图',
  awkward: '大型社死现场、所有人都沉默、一本正经的荒诞构图',
};

export class ImageGenerationError extends Error {
  constructor(message, { statusCode = 503, code = 'IMAGE_PROVIDER_FAILED', provider = '', fallbackEligible = false } = {}) {
    super(message);
    this.name = 'ImageGenerationError';
    this.statusCode = statusCode;
    this.code = code;
    this.provider = provider;
    this.fallbackEligible = fallbackEligible;
  }
}

export function normalizeImageRequest(payload = {}) {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim().slice(0, 500) : '';
  if (prompt.length < 2) throw new ImageGenerationError('至少输入两个字', { statusCode: 400, code: 'INVALID_PROMPT' });
  return {
    character: ALLOWED_CHARACTERS.has(payload.character) ? payload.character : 'nailoong',
    prompt,
    aspectRatio: ALLOWED_RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : '1:1',
    scene: Object.hasOwn(SCENES, payload.scene) ? payload.scene : 'cinematic',
  };
}

function nailoongPrompt(userPrompt, sceneDirection) {
  return `以参考图中的浅黄色软体玩偶为唯一主角，保持相同的圆胖豆包轮廓、光滑头顶、米白椭圆肚皮、两只浅绿色凸眼圆盘、闭合水平细线嘴与灰褐色圆润手脚。神态放松、一本正经，质感友善柔和。场景：${sceneDirection}。情节：${userPrompt}。画面干净，不放置文字、品牌标志或界面。`;
}

function jiahaoPrompt(userPrompt, sceneDirection) {
  return `创作一张具有中文互联网幽默感的电影感人物图。参考图中的嘉豪人物是唯一主角，必须保持同一人物的脸型、发型、身材比例和整体气质，保留克制、略带距离感的镜头表现；不得替换成其他人物，不得卡通化、怪物化或改变身份特征。服装和动作可随情境自然调整，画面友善，不丑化人物。场景方向：${sceneDirection}，加入克制的电蓝视觉线索。用户情境：${userPrompt}。画面不要出现文字、品牌标志或界面。`;
}

export function buildAbstractImagePrompt(userPrompt, scene = 'cinematic', character = 'nailoong') {
  const direction = SCENES[scene] || SCENES.cinematic;
  return character === 'jiahao' ? jiahaoPrompt(userPrompt, direction) : nailoongPrompt(userPrompt, direction);
}

function providerError(status, details = {}) {
  const diagnostic = `${details?.code || ''} ${details?.message || ''}`.trim();
  if (details?.code === 'OutputImageSensitiveContentDetected') {
    return new ImageGenerationError('生成结果被火山误拦截', { statusCode: 503, code: 'OUTPUT_SAFETY_RETRYABLE', provider: 'volcengine' });
  }
  if ((status === 400 || status === 422) && /prompt|content|safety|sensitive|敏感|违规/i.test(diagnostic)) {
    return new ImageGenerationError('图片描述未通过校验，请换个友善的说法', { statusCode: 400, code: 'INVALID_PROMPT', provider: 'volcengine' });
  }
  if (status === 400 || status === 422) return new ImageGenerationError('火山引擎图片服务参数不兼容', { code: 'PROVIDER_INVALID_PARAMETER', provider: 'volcengine' });
  const code = status === 429 ? 'RATE_LIMITED' : status === 402 ? 'QUOTA_EXHAUSTED' : status === 401 || status === 403 ? 'AUTHENTICATION_FAILED' : 'PROVIDER_FAILED';
  return new ImageGenerationError('火山引擎图片服务暂时不可用', { code, provider: 'volcengine' });
}

async function postImage(url, key, body, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_PROVIDER_TIMEOUTS.volcengine);
  try {
    const response = await fetchImpl(url, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError(response.status, { code: data?.error?.code, message: data?.error?.message });
    return data;
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error;
    throw new ImageGenerationError('火山引擎图片服务响应失败', {
      code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR', provider: 'volcengine',
    });
  } finally { clearTimeout(timeout); }
}

function imageResult(data, config, request) {
  const base64 = data?.data?.[0]?.b64_json;
  const imageUrl = data?.data?.[0]?.url;
  if (!base64 && !imageUrl) throw new ImageGenerationError('图片服务没有返回可用图片', { code: 'EMPTY_IMAGE', provider: 'volcengine' });
  return {
    id: String(data?.id || `volcengine-${Date.now()}`),
    character: request.character,
    mediaType: 'image',
    provider: 'volcengine',
    model: config.model,
    source: '火山引擎图片生成',
    ...(base64 ? { imageDataUrl: `data:image/jpeg;base64,${base64}` } : { imageUrl }),
    aspectRatio: request.aspectRatio,
  };
}

export async function generateAbstractImage(payload, config, fetchImpl = fetch) {
  const request = normalizeImageRequest(payload);
  const volcengine = config?.volcengine || {};
  if (!volcengine.key) throw new ImageGenerationError('火山引擎图片生成服务尚未配置', { code: 'NOT_CONFIGURED' });
  const configuredReference = config?.references?.[request.character] || (request.character === 'nailoong' ? config?.referenceImageUrl : '');
  const referenceImages = (Array.isArray(configuredReference) ? configuredReference : [configuredReference]).filter(Boolean);
  if (!referenceImages.length) throw new ImageGenerationError('角色参考图尚未配置', { code: 'REFERENCE_NOT_CONFIGURED' });
  const body = {
    model: volcengine.model,
    prompt: buildAbstractImagePrompt(request.prompt, request.scene, request.character),
    size: SIZE_BY_RATIO[request.aspectRatio], response_format: 'url', watermark: true,
    output_format: 'jpeg', sequential_image_generation: 'disabled', image: referenceImages,
  };
  let data;
  try {
    data = await postImage(volcengine.url, volcengine.key, body, fetchImpl);
  } catch (error) {
    if (error?.code !== 'OUTPUT_SAFETY_RETRYABLE') throw error;
    data = await postImage(volcengine.url, volcengine.key, body, fetchImpl);
  }
  return imageResult(data, volcengine, request);
}
