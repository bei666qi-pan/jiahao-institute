import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createLeagueJudge } from '../../server/league.mjs';

async function withModel(responseBody, run) {
  let requestBody = null;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(responseBody));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`, () => requestBody);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('联赛 AI 判定关闭思考并返回可公开结构', async () => {
  await withModel({
    choices: [{ message: { content: '{"score":87,"tag":"淡定王","verdict":"人没起身，借口已经先到现场。","publishable":true}' } }],
    usage: { prompt_tokens: 50, completion_tokens: 20 },
  }, async (base, getRequest) => {
    const judge = createLeagueJudge({ MINIMAX_TEXT_API_KEY: 'test-key', MINIMAX_TEXT_BASE_URL: base, MINIMAX_TEXT_MODEL: 'MiniMax-M3' });
    const result = await judge({ prompt: '你迟到了怎么解释？', answer: '我只是让时间先走一步。', character: 'jiahao' });
    assert.deepEqual(result.data, { score: 87, tag: '淡定王', verdict: '人没起身，借口已经先到现场。', publishable: true });
    assert.equal(result.provider.id, 'minimax');
    assert.equal(getRequest().thinking.type, 'disabled');
    assert.equal(getRequest().response_format.type, 'json_object');
    assert.equal(getRequest().max_tokens, 220);
  });
});

test('联赛 AI 未配置时明确失败而不伪造分数', async () => {
  const judge = createLeagueJudge({ MINIMAX_TEXT_API_KEY: '', MINIMAX_API_KEY: '', DEEPSEEK_API_KEY: '' });
  await assert.rejects(() => judge({ prompt: '题目', answer: '答案', character: 'jiahao' }), /文字大模型尚未配置/);
});
