const metric = (value, change) => ({ value, previous: value / (1 + change / 100), change });

export const demoOverview = {
  range: '7d',
  generatedAt: '2026-07-27T10:30:00+08:00',
  traffic: {
    visitors: metric(3216, 12.6), sessions: metric(4908, 15.3), averageActiveSeconds: metric(222, 8.7),
    activeSeconds: metric(1_072_800, 14.2), pageViews: metric(8642, 13.8), newVisitorRate: metric(68.4, 4.7), bounceRate: metric(31.6, -3.2),
  },
  api: {
    requests: metric(12842, 16.1), successRate: metric(98.7, .6), averageLatencyMs: metric(2400, -4),
    estimatedCostMicros: metric(186_420_000, 18.9), costCoverage: 100,
  },
  series: [
    ['2026-07-21', 310, 620, 188], ['2026-07-22', 382, 650, 224], ['2026-07-23', 420, 920, 205],
    ['2026-07-24', 685, 1090, 248], ['2026-07-25', 812, 1150, 246], ['2026-07-26', 510, 900, 204], ['2026-07-27', 397, 678, 164],
  ].map(([bucket, visitors, sessions, averageActiveSeconds]) => ({ bucket, visitors, sessions, averageActiveSeconds })),
  apiSeries: [],
  providers: [
    { provider: 'deepseek', model: 'deepseek-v4-flash', requests: 8732, estimatedCostMicros: 128_730_000, pricedRequests: 8732 },
    { provider: 'ark', model: 'doubao-seed-2-0-mini-260428', requests: 4110, estimatedCostMicros: 57_690_000, pricedRequests: 4110 },
  ],
  endpoints: [
    { endpoint: '/api/analyze', requests: 8732, successRate: 98.9, p95Ms: 2100, estimatedCostMicros: 128_730_000 },
    { endpoint: '/api/pk', requests: 4110, successRate: 98.3, p95Ms: 2800, estimatedCostMicros: 57_690_000 },
  ],
  recentErrors: [
    { endpoint: '/api/analyze', status_code: 502, error_message: 'Bad Gateway', occurred_at: '2026-07-27T09:22:31+08:00' },
    { endpoint: '/api/pk', status_code: 504, error_message: '模型响应超时', occurred_at: '2026-07-27T08:07:18+08:00' },
    { endpoint: '/api/analyze', status_code: 429, error_message: '供应商请求限流', occurred_at: '2026-07-26T23:48:55+08:00' },
  ],
  productFunnel: [
    ['assessment_started', 2860, 2410], ['assessment_completed', 2184, 1972], ['share_clicked', 914, 803],
    ['challenge_created', 642, 588], ['challenge_opened', 1088, 951], ['friend_completed', 531, 486],
  ].map(([event, events, visitors]) => ({ event, events, visitors })),
  productInsights: {
    assessment: [
      ['assessment_started', 2860, 2410, 100], ['assessment_completed', 2184, 1972, 81.8],
      ['share_clicked', 914, 803, 40.7], ['challenge_created', 642, 588, 73.2],
    ].map(([event, events, visitors, conversion]) => ({ event, events, visitors, conversion })),
    invite: [
      ['challenge_opened', 1088, 951, 100], ['friend_completed', 531, 486, 51.1],
    ].map(([event, events, visitors, conversion]) => ({ event, events, visitors, conversion })),
    games: [
      { game: 'reaction', started: 868, completed: 702, players: 633, completionRate: 80.9 },
      { game: 'image', started: 412, completed: 374, players: 329, completionRate: 90.8 },
      { game: 'court', started: 308, completed: 272, players: 241, completionRate: 88.3 },
    ],
    image: { requests: 412, successes: 374, successRate: 90.8, p95Ms: 18200, averageLatencyMs: 9300 },
  },
};

export const demoVisits = {
  rows: Array.from({ length: 12 }, (_, index) => ({
    session_id: `8b92••••${String(2200 + index).slice(-4)}`,
    started_at: new Date(Date.now() - index * 37 * 60_000).toISOString(),
    last_seen_at: new Date(Date.now() - index * 34 * 60_000).toISOString(),
    active_seconds: 48 + index * 17, page_views: 1 + index % 4, api_requests: index % 3,
    landing_path: '/', referrer_host: index % 3 === 0 ? 'xiaohongshu.com' : index % 3 === 1 ? 'direct' : 'douyin.com',
    device_category: index % 2 ? 'mobile' : 'desktop',
  })),
  nextCursor: null,
};

export const demoRequests = {
  rows: Array.from({ length: 14 }, (_, index) => ({
    id: index + 1, request_id: `req-${String(92831 - index)}`, endpoint: index % 3 ? '/api/analyze' : '/api/pk',
    mode: index % 3 ? 'text' : 'pk', provider: index % 3 ? 'deepseek' : 'ark', model: index % 3 ? 'deepseek-v4-flash' : 'doubao-seed-2-0-mini-260428',
    status_code: index === 3 ? 502 : 200, ok: index !== 3, latency_ms: 1180 + index * 137,
    input_tokens: 560 + index * 21, output_tokens: 190 + index * 8, cached_input_tokens: index % 2 ? 120 : 0,
    estimated_cost_micros: 12400 + index * 230, pricing_configured: true,
    error_message: index === 3 ? 'Bad Gateway' : null, occurred_at: new Date(Date.now() - index * 18 * 60_000).toISOString(),
  })),
  nextCursor: null,
};

export const demoCosts = {
  range: '7d',
  byDay: Array.from({ length: 7 }, (_, index) => ({ day: `2026-07-${21 + index}`, input_tokens: 120000 + index * 11000, output_tokens: 48000 + index * 5300, cached_input_tokens: 22000 + index * 2000, estimated_cost_micros: 18_000_000 + index * 2_100_000, requests: 1500 + index * 80, priced_requests: 1500 + index * 80 })),
  byProvider: demoOverview.providers.map((item) => ({ ...item, input_tokens: 720000, output_tokens: 280000, cached_input_tokens: 140000 })),
  byEndpoint: demoOverview.endpoints.map((item) => ({ endpoint: item.endpoint, requests: item.requests, estimated_cost_micros: item.estimatedCostMicros })),
};

export const demoStatus = {
  databaseConfigured: true, databaseHealthy: true, lastDatabaseSuccessAt: new Date().toISOString(), lastDatabaseError: null,
  droppedWrites: 0, retentionDays: 90, uptimeSeconds: 184220, textModelConfigured: true, visionModelConfigured: true,
  adminPasswordConfigured: true, textModel: 'deepseek-v4-flash', visionModel: 'doubao-seed-2-0-mini-260428',
};
