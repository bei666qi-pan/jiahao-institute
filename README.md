# 嘉豪鉴定所

一个以网络玩梗传播为核心的娱乐人格测试。输入文案或上传照片/聊天截图，生成稳定的嘉豪指数、六维豪气成分、嘉豪物种与可下载分享海报。

## 功能

- 文字、照片、聊天记录三种鉴定模式
- DeepSeek 文字鉴定与火山方舟多模态图片鉴定
- 云端不可用时自动退回本地确定性娱乐评分
- 戏剧化分析过程、六维雷达图与判词
- 自在极意豪、美式嘉豪、深情破碎豪等物种图鉴
- 1080 × 1440 分享海报生成与下载
- 本地鉴定历史记录
- 响应式布局、键盘焦点与减少动态效果支持

> 用户明确同意后，内容会发送至对应云端模型进行一次性娱乐分析；本站不持久化保存内容。结果仅供娱乐，不构成任何事实判断。

## 本地开发

```bash
npm install
npm run dev
```

Vite 开发服务器未配置云端模型代理，本地界面调试会自动使用备用算法。若需联调完整接口，请先构建并通过生产服务启动：

```bash
cp .env.example .env
# 在 .env 中填入模型密钥；不要提交该文件
npm run build
set -a && source .env && set +a
npm start
```

模型路由：

- 文字鉴定：`DEEPSEEK_MODEL`
- 照片、聊天截图：`ARK_MODEL`

## 构建

```bash
npm run build
```

## Docker

```bash
docker build -t jiahao-institute .
docker run --rm -p 8080:8080 jiahao-institute
```

健康检查：`GET /healthz`

## 开源协议

MIT
