<div align="center">
  <img src="./public/favicon.svg" width="86" height="86" alt="嘉豪鉴定所 Logo" />
  <h1>嘉豪鉴定所</h1>
  <p><strong>测测你身上，到底藏着多少豪气。</strong></p>
  <p>一个由 AI 驱动的娱乐人格鉴定站：输入文案或上传图片，即刻解锁你的嘉豪指数、豪气成分与专属物种。</p>
  <p>
    <a href="#中文说明">中文</a> · <a href="#english">English</a> · <a href="#本地开发">快速开始</a>
  </p>
</div>

<p align="center">
  <img src="./design/jiahao-implementation-home.png" alt="嘉豪鉴定所首页预览" width="100%" />
</p>

---

## 中文说明

> 纯属娱乐，豪气当真。所有鉴定结果均为趣味内容，不构成事实判断或建议。

### 这是什么？

**嘉豪鉴定所**是一个轻松、玩梗、适合分享的 AI 人格测试工具。写下一句话、上传一张照片或聊天截图，看看你属于「美式嘉豪」「深情破碎豪」还是「自在极意豪」。

### 核心体验

| 功能 | 说明 |
| --- | --- |
| 多模态鉴定 | 照片优先，支持授权自拍、相册、文字与聊天记录。 |
| 聊天文件分析 | 支持图片、PDF、TXT 与 DOCX；单次最多 3 份、单份 10MB。 |
| 双人豪气 PK | 双方可分别提交照片、聊天或文字，由模型完成综合娱乐裁决。 |
| 嘉豪语录生成器 | 将普通话按豪气等级与风格改写，支持一键去豪化、复制与分享卡片。 |
| AI 趣味判词 | 由模型生成戏剧化分析过程、嘉豪指数与专属判词。 |
| 六维豪气成分 | 用雷达图呈现你的豪气构成，一眼看懂人格配方。 |
| 物种图鉴 | 解锁不同嘉豪物种与隐藏天赋。 |
| 一键分享 | 生成 1080 × 1440 分享海报并下载。 |
| 隐私优先 | 仅在获得明确同意后才请求云端分析；内容不会被本站持久化保存。 |
| 稳定可玩 | 云端不可用时，自动回退到本地确定性娱乐评分。 |

### 本地开发

**环境要求：** Node.js 18 或更高版本。

```bash
npm install
npm run dev
```

Vite 开发服务会自动使用本地备用评分算法。若要联调云端模型，请构建并通过生产服务启动：

```bash
cp .env.example .env
# 在 .env 中填入模型密钥；切勿提交该文件
npm run build
set -a && source .env && set +a
npm start
```

### 模型配置

| 场景 | 环境变量 |
| --- | --- |
| 文字鉴定与语录 | `MINIMAX_TEXT_MODEL`（存在 `MINIMAX_API_KEY` 时优先；否则兼容 `DEEPSEEK_MODEL`） |
| 照片与聊天截图鉴定 | `MINIMAX_TEXT_MODEL`（MiniMax 未配置时才回退 `ARK_MODEL`） |

物种图片默认通过现有火山引擎 TOS + CDN 链路 `https://assets.versecraft.cn/jiahao` 加载；如需切换资源域名，可在构建时设置 `VITE_ASSET_BASE_URL`。

### 角色创作室

- 奶龙和嘉豪使用独立参考图与提示词边界，图片统一由 `doubao-seedream-5.0-lite` 生成。
- 图片调用使用火山引擎 Agent Plan 专属 `/api/plan/v3` 链路，模型为 `doubao-seedream-5.0-lite`。
- 视频使用 MiniMax Hailuo 2.3 图生视频链路。服务端先按用户选择的角色与比例生成一致的首帧，再创建 768P、6 秒、带 AI 水印的异步视频任务。
- MiniMax 余额、TokenPlan 资源或请求频率耗尽时，前台统一提示“今日使用人数过多，暂不支持生成”，不暴露供应商错误。
- 视频额度依据服务端签发的匿名访客 Cookie 和上海自然日计算，每位访客每日 1 次。Cookie 被清除后会被视为新匿名访客。
- 视频额度必须配置 `DATABASE_URL`；数据库不可用时接口返回 503，不使用前端额度降级。服务端只保存任务、角色、日期与状态，不保存提示词或生成内容。

### 流量与成本观测台

部署后访问 `/admin`。观测台使用第一方匿名设备 ID 统计访客、会话、页面浏览与有效活跃时长，同时记录模型接口的状态、延迟、token 用量和预估人民币成本；不会保存用户提交的文字、图片、聊天内容或模型结果。

必须在部署平台的 Secret/环境变量中配置：

```bash
DATABASE_URL=postgresql://...
ADMIN_PASSWORD=请使用高强度密码
DEEPSEEK_INPUT_CNY_PER_MILLION=
DEEPSEEK_OUTPUT_CNY_PER_MILLION=
DEEPSEEK_CACHED_INPUT_CNY_PER_MILLION=
MINIMAX_TEXT_INPUT_CNY_PER_MILLION=
MINIMAX_TEXT_OUTPUT_CNY_PER_MILLION=
MINIMAX_TEXT_CACHED_INPUT_CNY_PER_MILLION=
ARK_INPUT_CNY_PER_MILLION=
ARK_OUTPUT_CNY_PER_MILLION=
ARK_CACHED_INPUT_CNY_PER_MILLION=
```

单价单位为「人民币 / 百万 token」。缺少供应商 usage 或单价时，该请求显示为未计价，不会被误记为零成本。数据库迁移在服务启动时自动执行；访问、会话与请求明细默认保留 90 天，成功汇总后再清理原始明细。

### 构建与部署

```bash
npm run build
```

使用 Docker：

```bash
docker build -t jiahao-institute .
docker run --rm -p 8080:8080 jiahao-institute
```

服务健康检查：`GET /healthz`

### 品牌标识

本仓库的 README 和网站 favicon 均使用同一枚 AI 能量标识：[`public/favicon.svg`](./public/favicon.svg)。

### 开源协议

本项目采用 [MIT License](./LICENSE) 开源。

---

<a id="english"></a>

## English

> For entertainment only. Every result is playful fictional content, not a factual assessment or advice.

### What is Jiahao Institute?

**Jiahao Institute** is a playful, shareable AI personality test. Enter a line of text, upload a photo, or share a chat screenshot to uncover your Jiahao Index, charisma profile, and signature species—from *American Jiahao* to *Heartbroken Jiahao* and *Ultra Instinct Jiahao*.

### Highlights

| Feature | Description |
| --- | --- |
| Multimodal analysis | Analyze text, photos, and chat screenshots. |
| AI-generated verdicts | Receive dramatic analysis, a Jiahao Index, and a tailored verdict. |
| Jiahao quote generator | Rewrite everyday text by intensity and style, normalize over-dramatic phrasing, and save share cards. |
| Six-dimension profile | Explore your personality mix through an easy-to-read radar chart. |
| Species collection | Discover Jiahao archetypes and hidden talents. |
| Share-ready posters | Generate and download a 1080 × 1440 results poster. |
| Privacy-minded | Cloud analysis only starts after explicit consent; submitted content is not persistently stored by this site. |
| Reliable fallback | A deterministic local entertainment score keeps the experience available when cloud services are offline. |

### Getting started

**Requirements:** Node.js 18+.

```bash
npm install
npm run dev
```

The Vite development server uses the local fallback scorer. To test cloud models, build first and run the production server:

```bash
cp .env.example .env
# Add your model keys to .env. Never commit this file.
npm run build
set -a && source .env && set +a
npm start
```

### Model routing

| Input | Environment variable |
| --- | --- |
| Text analysis and quotes | `MINIMAX_TEXT_MODEL` when `MINIMAX_API_KEY` is configured; otherwise `DEEPSEEK_MODEL` |
| Photo, document-image, and mixed PK analysis | `MINIMAX_TEXT_MODEL` (falls back to `ARK_MODEL` only when MiniMax is not configured) |

Species images load from the existing Volcengine TOS + CDN path at `https://assets.versecraft.cn/jiahao` by default. Set `VITE_ASSET_BASE_URL` at build time to override it.

### Build & Docker

```bash
npm run build
docker build -t jiahao-institute .
docker run --rm -p 8080:8080 jiahao-institute
```

Health check: `GET /healthz`

### License

Released under the [MIT License](./LICENSE).
