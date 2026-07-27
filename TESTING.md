# 嘉豪鉴定所 测试体系

## 测试架构概览

```
test/
├── core.test.mjs                    # 核心功能测试（validation, normalization, PK）
├── observability.test.mjs           # 观测与成本计算测试
├── unit/                            # 单元测试
│   ├── frontend.test.mjs            # 前端纯函数（hashString, clamp, analyze, makeFallback*）
│   ├── server-utils.test.mjs        # 后端工具（extractJson, cleanText, normalize*, getProvider）
│   ├── observability-utils.test.mjs # 观测工具（finiteNonNegative, cookie, deviceCategory, metric）
│   ├── admin-app-utils.test.mjs     # 管理后台工具（formatNumber, formatCost, currentView）
│   └── admin-auth-extended.test.mjs # 认证模块（sameOrigin, currentAttempt, rate limiting）
├── integration/                     # 集成测试
│   ├── api.test.mjs                 # HTTP 接口测试（路由、状态码、安全头）
│   ├── full-chain.test.mjs          # 全链路测试（Mock模型服务器 + 真实HTTP服务）
│   └── security-edge-cases.test.mjs # 安全与边缘测试（CSRF、速率限制、大body、空body）
├── e2e/                             # 端到端测试
│   ├── app.spec.js                  # 基础E2E（页面加载、响应式、无障碍、导航）
│   └── app-deep.spec.js            # 深度E2E（PK流程、历史记录、海报、图鉴、Admin）
├── helpers/                         # 测试辅助
│   ├── mock-model-server.mjs        # Mock LLM服务器（模拟DeepSeek/Ark API）
│   └── ai-test-analyzer.mjs         # AI测试覆盖率分析工具
├── fixtures/                        # 测试夹具（预留）
└── helpers/                         # 测试辅助（预留）
```

## 测试统计

| 层级 | 文件 | 测试数 |
|------|------|--------|
| **单元测试** | 7 个文件 | **187** |
| **集成测试** | 3 个文件 | **41** |
| **E2E 测试** | 2 个文件 | **20** |
| **总计** | **12 个文件** | **248** ✅ |

### 单元测试明细

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `frontend.test.mjs` | 47 | hashString, clamp, isAcceptedFile, validateFiles, decideFallbackWinner, analyze, makeFallbackPk, makeFallbackQuote |
| `server-utils.test.mjs` | 49 | extractJson, cleanText, clampServer, normalizeResult, normalizePkResult, validImages, getProvider, cookie |
| `observability-utils.test.mjs` | 30 | finiteNonNegative, integerOrNull, parseCookies, cleanPath, referrerHost, deviceCategory, number, percentChange, metric, hashToken, digest, clientKey |
| `admin-app-utils.test.mjs` | 21 | formatNumber, formatDuration, formatCost, formatTime, currentView, changeValue, metricCalc, NAV integrity |
| `admin-auth-extended.test.mjs` | 28 | sameOrigin, clientKey, safePasswordEqual, hashToken, currentAttempt (rate limiting), loginAdmin flow, digest |
| `core.test.mjs` | 6 | validateFiles, decideFallbackWinner, normalizeResult, normalizePkResult, validImages |
| `observability.test.mjs` | 6 | parseUsage, calculateEstimatedCost, activeDeltaSeconds, getRangeConfig, encodeCursor/decodeCursor, safePasswordEqual |

### 集成测试明细

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `api.test.mjs` | 18 | 所有HTTP路由、SPA回退、安全头、错误处理 |
| `full-chain.test.mjs` | 7 | Mock模型服务器全链路：analyze/pk/quote 完整请求→响应 |
| `security-edge-cases.test.mjs` | 16 | CSRF保护、速率限制模拟、body边界、非法JSON、空body、Admin认证、Telemetry降级 |

### E2E 测试明细

| 文件 | 测试数 | 覆盖内容 |
|------|--------|----------|
| `app.spec.js` | 12 | 首页渲染、页脚、导航切换、文字鉴定全流程、语录生成全流程、响应式设计、无障碍、meta标签、控制台错误 |
| `app-deep.spec.js` | 8 | 双人PK流程、物种图鉴交互、鉴定历史、海报生成、重置、语录预设、Admin登录页、多页面快速切换 |

## 测试命令

| 命令 | 说明 |
|------|------|
| `npm test` | 运行所有单元测试（187个） |
| `npm run test:unit` | 运行所有单元测试 |
| `npm run test:integration` | 运行所有集成测试（41个） |
| `npm run test:all` | 运行单元测试 + 集成测试（228个） |
| `npm run test:e2e` | 运行 Playwright E2E 测试（20个） |
| `npm run test:e2e:ui` | 以 UI 模式运行 E2E 测试 |
| `npm run test:coverage` | 运行 AI 测试覆盖率分析 |

## 本地测试运行

```bash
# 安装依赖
npm install
npx playwright install chromium

# 运行所有单元测试 + 集成测试
npm run test:all

# 运行 E2E 测试（需要先构建）
npm run build
npm run test:e2e

# 以 UI 模式调试 E2E
npm run test:e2e:ui

# 运行 AI 覆盖率分析
npm run test:coverage
```

## CI/CD

GitHub Actions 工作流配置于 `.github/workflows/test.yml`，在 push/PR 到主分支时自动运行：
- **unit** job：运行所有单元测试 + 集成测试（228个）
- **e2e** job：构建项目，安装 Chromium，运行 E2E 测试（20个）

## 测试策略

1. **纯函数优先**：核心逻辑通过纯函数实现，易于单独测试
2. **Mock 全链路**：使用 Mock LLM 服务器验证从请求→模型→归一化→响应的完整链路
3. **安全边界覆盖**：CSRF保护、速率限制、body大小限制、非法输入处理
4. **E2E 关键路径**：文字鉴定、PK对决、语录生成、海报生成、物种图鉴、Admin观测台
5. **AI 辅助分析**：`ai-test-analyzer.mjs` 自动扫描源码导出函数，对比已测试函数，生成覆盖率缺口报告

## 测试覆盖率缺口（已知）

以下为前端React组件，需要在浏览器环境（jsdom）中测试，当前通过 E2E 测试间接覆盖：
- App.jsx 渲染组件（Icon, Radar, Modal, PosterModal等）
- fileProcessing.js 浏览器API（imageFileToDataUrl, readDocx, readPdf）
- telemetry.js 浏览器API（post, startTelemetry）
- AdminApp.jsx 渲染组件

以下为依赖PostgreSQL数据库的功能，通过Mock服务器间接测试：
- Observability 数据库方法（recordSession, heartbeat, overview等）
- admin-auth 数据库方法（loginAdmin, verifyAdmin, logoutAdmin）
