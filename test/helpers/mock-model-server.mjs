// Mock LLM server that simulates DeepSeek/Ark API responses for testing the full pipeline
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const MOCK_RESPONSES = {
  analyze: {
    choices: [{
      message: {
        content: JSON.stringify({
          score: 78,
          type: '深情破碎豪',
          level: '高阶嘉豪',
          verdict: '你的克制中流淌着深情，侧脸与夜色的组合不再需要多余解释。',
          dimensions: {
            mystery: 82,
            flex: 45,
            niche: 35,
            deep: 88,
            show: 60,
            language: 55,
          },
          traits: ['深夜在线', '嘴硬心软', '歌单循环', '侧脸叙事'],
          evidence: [
            '输入中出现明显的深夜独白式表达结构。',
            '克制表达与深情浓度形成了极具嘉豪特征的反差。',
            '句式留白符合小众优越豪的信息释放节奏。',
          ],
          comment: '你试图把情绪压进一行字，但深夜与电量不足的暗示已经出卖了你。这才是高阶嘉豪的正确打开方式：不解释，让氛围自己发酵。',
        }),
      },
    }],
    usage: {
      prompt_tokens: 150,
      completion_tokens: 250,
      prompt_tokens_details: { cached_tokens: 30 },
    },
  },

  pk: {
    choices: [{
      message: {
        content: JSON.stringify({
          participants: [
            {
              score: 82, type: '美式嘉豪', level: '豪气冲天',
              verdict: '墨镜与冰美式的组合拳，每一步都像在拍音乐短片。',
              dimensions: { mystery: 50, flex: 90, niche: 45, deep: 35, show: 88, language: 60 },
              traits: ['墨镜常驻', '自以为很潮', '冰美式', '潮流步态'],
              evidence: ['走两步像拍音乐短片。', '潮流单品密度较高。', '看似随意的构图实则精心。'],
              comment: '美式嘉豪的精髓在于“我就是随便一拍”，但每个细节都在呼喊关注。',
            },
            {
              score: 75, type: '计算机嘉豪', level: '高阶嘉豪',
              verdict: '终端常驻，配置单和键盘轴体张口就来。',
              dimensions: { mystery: 40, flex: 50, niche: 88, deep: 30, show: 20, language: 85 },
              traits: ['终端常驻', '配置敏感', '轴体研究', '底层爱好者'],
              evidence: ['出现大量技术术语。', '对配置参数表现出非功能性关注。', '底层原理的引用频率超过实用需要。'],
              comment: '计算机嘉豪对硬件的热爱已经溢出屏幕，机械键盘轴体声是最好的BGM。',
            },
          ],
          battle: {
            winner: 'A',
            title: '潮流 vs 极客',
            reason: '美式嘉豪的镜头掌控力在本轮中更胜一筹，而计算机嘉豪虽术语密度高但视觉表现力较弱。',
            decisiveDimensions: ['镜头掌控', '小众优越'],
          },
        }),
      },
    }],
    usage: { prompt_tokens: 300, completion_tokens: 450, prompt_tokens_details: { cached_tokens: 50 } },
  },

  quote: {
    choices: [{
      message: {
        content: JSON.stringify({
          output: '不是天气好，只是有些事情，习惯了就好。',
        }),
      },
    }],
    usage: { prompt_tokens: 80, completion_tokens: 60, prompt_tokens_details: { cached_tokens: 10 } },
  },
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startMockServer(port = 0) {
  let callCount = 0;
  const calls = [];

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/chat/completions') {
      return sendJson(res, 404, { error: 'not found' });
    }

    try {
      const body = await readBody(req);
      callCount += 1;

      // Determine which mock response to use based on system prompt
      const systemPrompt = body.messages?.[0]?.content || '';
      let response;

      if (systemPrompt.includes('双人豪气裁决官') || systemPrompt.includes('PK')) {
        response = MOCK_RESPONSES.pk;
      } else if (systemPrompt.includes('嘉豪语录生成器') || systemPrompt.includes('文案改写')) {
        response = MOCK_RESPONSES.quote;
      } else {
        response = MOCK_RESPONSES.analyze;
      }

      calls.push({ systemPrompt: systemPrompt.slice(0, 80), model: body.model, callCount });

      // Simulate some latency
      await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
      sendJson(res, 200, response);
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        server,
        calls,
        get callCount() { return callCount; },
        async close() {
          return new Promise((r) => server.close(r));
        },
      });
    });
  });
}
