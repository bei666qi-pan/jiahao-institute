# 候选版本启动与验证

当前状态：**本地有限试玩候选通过独立评审，待发布验证；文档整体修订已复验，首轮数量遵循与课堂泄底仍有弱点**。详见 [角色动作迭代记录](docs/mechanics-iteration.md)。历史失败记录保留：[初版](docs/solo-scene-iteration.md)、[日常场景](docs/daily-scenes-iteration.md)、[角色喜剧](docs/character-comedy-iteration.md)。

## 启动

工作区 `/Users/qi/Desktop/项目/嘉豪-solo-scene`，分支 `codex/solo-scene-upgrade`。

```sh
cd /Users/qi/Desktop/项目/嘉豪-solo-scene
npm run build
PORT=5194 DOTENV_CONFIG_PATH=.env.local npm start
```

本机启动显式指定 `PORT=5194`；沿用隔离 PostgreSQL、独立签名密钥和已有模型服务配置，不提交 `.env.local`。其他机器从 `.env.example` 配置自己的测试数据库、随机 `SOCIAL_SIGNING_SECRET`、模型凭据和 `PORT`。依赖使用已有安装；全新克隆先 `npm ci`。

如本轮隔离数据库停止，可用已有 PostgreSQL 工具恢复（不要对其他数据库初始化或清空）：

```sh
pg_ctl -D /tmp/jiahao-solo-pg -l /tmp/jiahao-solo-evidence/postgres.log -o '-h 127.0.0.1 -p 55439 -k /tmp' start
```

浏览器访问 http://127.0.0.1:5194 。本站分享链接是本机地址，测试接收方请用同一电脑的另一个浏览器身份。没有生产发布。

## 自动回归

```sh
npm run test:unit
TEST_DATABASE_URL=postgresql://jiahao_test@127.0.0.1:55439/jiahao_final_regression npm run test:integration
PLAYWRIGHT_PORT=5194 npx playwright test --workers=2
PLAYWRIGHT_PORT=5194 npx playwright test test/e2e/scenes.spec.mjs test/e2e/league-recovery.spec.js --workers=2
```

数据库集成测试必须配置独立 TEST_DATABASE_URL；缺失数据库而跳过不能算通过。集成文件串行执行，避免共享测试库首次迁移竞争。普通自动化使用受控模型夹具验证协议和恢复，不能替代真实模型内容验收。界面用例在桌面和手机运行；生产冒烟默认不运行，手机专用构图在桌面跳过。测试运行期间不要同时重新构建 dist。

也可用 `npx playwright test --config playwright.scenes.config.mjs` 启动独立 Vite 界面夹具检查。

## 真实玩家操作适配器

适配器只允许本机真实业务接口。它保留匿名 Cookie、签名状态和请求幂等键，输出仅包含玩家可见信息。会话文件含凭据，放仓库外；可见轨迹为同名 `.visible.jsonl`。不提供隐藏记忆、内部提示或标准答案。

```sh
export PLAYTEST_URL=http://127.0.0.1:5194
node scripts/scene-playtest.mjs start /tmp/my-scene.json photo
node scripts/scene-playtest.mjs say /tmp/my-scene.json '把滤镜关掉再拍一张看看。'
node scripts/scene-playtest.mjs look /tmp/my-scene.json
# 阅读真实反馈后，自行决定下一句；不能预写完整探索对话。
node scripts/scene-playtest.mjs say /tmp/my-scene.json '你的下一句'
node scripts/scene-playtest.mjs end /tmp/my-scene.json '我认怂，先撤了'
# 仅失败待恢复时，玩家明确选择重试：
node scripts/scene-playtest.mjs retry /tmp/my-scene.json
```

默认每次有效出招一次真实模型调用，单次等待上限30秒；不自动重试消费模型。明确失败的新请求与未决请求使用不同恢复策略。前三回合后不能继续；换场景或重玩用新会话文件。初期外部可见日志的 `status` 被玩法状态覆盖，后续改为 `httpStatus`；原日志保留，不能据前者统计 HTTP 成功率。

## 可复用场景

| 组别 | 初始条件与目标 | 行动边界 | 可接受结果／断言 | 观察 |
|---|---|---|---|---|
| 核心 | 新匿名玩家，消息发错群，完成一局 | 自由短答，最多三招 | 回合1→2→3，明确结束；重玩新run；刷新保留 | 回应具体词句并回扣 |
| 探索 | 偷吃被抓，愿意谈判的玩家 | 只看当前反馈，不读内部状态 | 可以成交、认怂或拒绝，不要求赢 | 数量、计划和行动归属 |
| 恢复 | 第1招后断网／慢响应／刷新 | 同一未决请求恢复，不并发耗费 | 不推进假回合，不丢输入；相同请求合并 | 错误和等待可理解 |
| 边界 | 非法结构、重复键、篡改token、换身份 | 单测和真实库夹具，不冒充玩家 | 结构失败无默认结果；串局／越权拒绝 | 失败可恢复 |
| 分享 | 已完成一局，选择一个回合 | 先预览，确认后公开 | 取消不创建；只选定片段；所有者可撤销 | 卡片独立可读，接收方可玩 |
| 分享期限 | 测试时钟推进七天 | 明确模拟时间 | 内容清除，仍有同题入口；无所有者凭据 | 不冒充真实七日留存 |
| 联赛 | 两个测试身份，已知规则 | 提交、投票、显式重判 | 非法判词待重判；零分合法；跨午夜重算不漏分 | 保存提示与服务器一致 |
| 最终留出 | 合照不愿保留、KTV拒绝唱歌 | 玩家自行改变行动，开发前未用于调优 | 可拒绝、结束；不要求配合剧情 | 本轮两者一致性均未过 |
| 有限重复 | 游戏空大／迟到各两局 | 保持初始设定和打法 | 展示全部尝试，不能只留最好一局 | 仍有捏造玩家动作 |

本轮已消耗的留出和重复案例都归档；下轮如果针对它们修改，应转回归，并重新留出新的动机与行动组合。独立评审反例包括无关股票回复、万能重复夸奖、未来计划被写成已完成加分；均识别不通过。此项仅证明评审能识别反例，不证明产品有自动语义检查器。
