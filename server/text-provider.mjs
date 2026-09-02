export function resolveTextProvider(env = process.env) {
  const minimaxKey = env.MINIMAX_TEXT_API_KEY || env.MINIMAX_API_KEY || '';
  if (minimaxKey) {
    return {
      id: 'minimax',
      base: (env.MINIMAX_TEXT_BASE_URL || 'https://api.minimax.cn/v1').replace(/\/$/, ''),
      model: env.MINIMAX_TEXT_MODEL || 'MiniMax-M3',
      key: minimaxKey,
      source: '云端文字大模型',
      prices: {
        input: env.MINIMAX_TEXT_INPUT_CNY_PER_MILLION,
        output: env.MINIMAX_TEXT_OUTPUT_CNY_PER_MILLION,
        cachedInput: env.MINIMAX_TEXT_CACHED_INPUT_CNY_PER_MILLION,
      },
    };
  }

  return {
    id: 'deepseek',
    base: (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
    model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    key: env.DEEPSEEK_API_KEY || '',
    source: '云端文字大模型',
    prices: {
      input: env.DEEPSEEK_INPUT_CNY_PER_MILLION,
      output: env.DEEPSEEK_OUTPUT_CNY_PER_MILLION,
      cachedInput: env.DEEPSEEK_CACHED_INPUT_CNY_PER_MILLION,
    },
  };
}
