const ALLOWED_RATIOS = new Set(['1:1', '3:4', '16:9']);
// Seedream 5.0 Lite requires at least 3,686,400 output pixels.
const SIZE_BY_RATIO = { '1:1': '2048x2048', '3:4': '1728x2304', '16:9': '2560x1440' };
const SCENES = {
  editorial: '暖白摄影棚、档案照构图、柔和低清3D质感、克制留白',
  cinematic: '雨夜电影感、潮湿街道、冷灰环境光、角色仍保持柔和低清3D质感',
  prank: '朋友整活现场、荒诞但友善、抓拍构图、轻微失焦的网络梗图质感',
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
    prompt,
    aspectRatio: ALLOWED_RATIOS.has(payload.aspectRatio) ? payload.aspectRatio : '1:1',
    scene: Object.hasOwn(SCENES, payload.scene) ? payload.scene : 'cinematic',
  };
}

export function buildAbstractImagePrompt(userPrompt, scene = 'cinematic') {
  const sceneDirection = SCENES[scene] || SCENES.cinematic;
  return `创作一张中文互联网抽象梗图。严格照搬参考图中的浅黄色软体人偶，不改变它的身体和脸：直立的圆胖大豆包轮廓，头顶与身体两侧完全光滑，没有耳朵、角或尾巴；米白肚皮呈椭圆形，浅绿色凸眼像两个圆盘并带黑色小瞳孔，脸上只有一条短短的细线嘴，没有鼻孔，面部其余位置保持光滑空白；灰褐色手脚，四肢短粗，圆胖肚子占身体大部分，放空又一本正经。这个角色网络称为“抽象奶蛙”，但不是生物青蛙。保持参考图那种低清、柔和、略笨拙的早期3D网络衍生质感。禁止画成官方奶龙或Q萌幼儿动画角色；禁止写实皮肤、蛙嘴、蛙腿、怪物化、尖牙、大嘴、黏液、恶心或恐怖元素。场景方向：${sceneDirection}。用户情境：${userPrompt}。画面不要出现文字、品牌标志或界面。`;
}

function providerError(provider, status, details = '') {
  const detailCode = typeof details === 'object' ? String(details?.code || '') : '';
  const detailMessage = typeof details === 'object' ? String(details?.message || '') : String(details || '');
  const diagnostic = `${detailCode} ${detailMessage}`.trim();
  if (status === 400 || status === 422) {
    if (/prompt|content|safety|sensitive|敏感|违规/i.test(diagnostic)) {
      return new ImageGenerationError('图片描述未通过校验，请换个友善的说法', {
        statusCode: 400, code: 'INVALID_PROMPT', provider, fallbackEligible: false,
      });
    }
    return new ImageGenerationError(`${provider === 'minimax' ? 'MiniMax' : '火山引擎'}图片服务参数不兼容`, {
      statusCode: 503, code: 'PROVIDER_INVALID_PARAMETER', provider, fallbackEligible: false,
    });
  }
  const reason = status === 429 ? 'rate_limited' : status === 402 ? 'quota_exhausted' : status === 401 || status === 403 ? 'authentication_failed' : status >= 500 ? 'provider_unavailable' : 'provider_failed';
  return new ImageGenerationError(`${provider === 'minimax' ? 'MiniMax' : '火山引擎'}图片服务暂时不可用${detailMessage ? `（${detailMessage.slice(0, 40)}）` : ''}`, {
    statusCode: 503, code: reason.toUpperCase(), provider, fallbackEligible: true,
  });
}

async function postImage(provider, url, key, body, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError(provider, response.status, {
      code: data?.error?.code || data?.base_resp?.status_code || '',
      message: data?.error?.message || data?.base_resp?.status_msg || '',
    });
    return data;
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error;
    const reason = error?.name === 'AbortError' ? 'timeout' : 'network_error';
    throw new ImageGenerationError(`${provider === 'minimax' ? 'MiniMax' : '火山引擎'}图片服务响应失败`, {
      statusCode: 503, code: reason.toUpperCase(), provider, fallbackEligible: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function imageResult(provider, model, data, fallback) {
  const base64 = provider === 'minimax' ? data?.data?.image_base64?.[0] : data?.data?.[0]?.b64_json;
  const imageUrl = provider === 'minimax' ? data?.data?.image_urls?.[0] : data?.data?.[0]?.url;
  if (!base64 && !imageUrl) throw new ImageGenerationError('图片服务没有返回可用图片', {
    statusCode: 503, code: 'EMPTY_IMAGE', provider, fallbackEligible: true,
  });
  return {
    id: String(data?.id || `${provider}-${Date.now()}`),
    provider,
    model,
    source: provider === 'minimax' ? 'MiniMax 图片生成' : fallback.used ? '火山引擎图片生成 · 自动降级' : '火山引擎图片生成',
    ...(base64 ? { imageDataUrl: `data:image/jpeg;base64,${base64}` } : { imageUrl }),
    fallback,
  };
}

async function callMinimax(request, config, referenceImageUrl, fetchImpl) {
  const data = await postImage('minimax', config.url, config.key, {
    model: config.model,
    prompt: buildAbstractImagePrompt(request.prompt, request.scene),
    aspect_ratio: request.aspectRatio,
    response_format: 'base64',
    n: 1,
    prompt_optimizer: true,
    aigc_watermark: true,
    ...(referenceImageUrl ? { subject_reference: [{ type: 'character', image_file: referenceImageUrl }] } : {}),
  }, fetchImpl);
  const businessCode = Number(data?.base_resp?.status_code || 0);
  if (businessCode !== 0) {
    const details = String(data?.base_resp?.status_msg || '');
    if (/prompt|content|safety|敏感|违规/i.test(details)) throw providerError('minimax', 400, details);
    throw providerError('minimax', 503, details);
  }
  return imageResult('minimax', config.model, data, { used: false });
}

async function callVolcengine(request, config, referenceImageUrl, fetchImpl, fallback) {
  const data = await postImage('volcengine', config.url, config.key, {
    model: config.model,
    prompt: buildAbstractImagePrompt(request.prompt, request.scene),
    size: SIZE_BY_RATIO[request.aspectRatio],
    response_format: 'b64_json',
    watermark: true,
    sequential_image_generation: 'disabled',
    ...(referenceImageUrl ? { image: [referenceImageUrl] } : {}),
  }, fetchImpl);
  return imageResult('volcengine', config.model, data, fallback);
}

export async function generateAbstractImage(payload, config, fetchImpl = fetch) {
  const request = normalizeImageRequest(payload);
  const minimax = config?.minimax || {};
  const volcengine = config?.volcengine || {};
  const referenceImageUrl = config?.referenceImageUrl || '';

  if (minimax.key) {
    try {
      return { ...(await callMinimax(request, minimax, referenceImageUrl, fetchImpl)), aspectRatio: request.aspectRatio };
    } catch (error) {
      if (!error?.fallbackEligible) throw error;
      if (!volcengine.key) throw error;
      const reason = String(error.code || 'provider_failed').toLowerCase();
      return { ...(await callVolcengine(request, volcengine, referenceImageUrl, fetchImpl, { used: true, from: 'minimax', reason })), aspectRatio: request.aspectRatio };
    }
  }

  if (!volcengine.key) throw new ImageGenerationError('图片生成服务尚未配置', { statusCode: 503, code: 'NOT_CONFIGURED' });
  return {
    ...(await callVolcengine(request, volcengine, referenceImageUrl, fetchImpl, { used: true, from: 'minimax', reason: 'not_configured' })),
    aspectRatio: request.aspectRatio,
  };
}
