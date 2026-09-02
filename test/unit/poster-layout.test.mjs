import test from 'node:test';
import assert from 'node:assert/strict';
import { battleCardLayout } from '../../src/app/poster.js';

test('战绩卡首屏构图压缩空白并让角色占据主要画面', () => {
  const layout = battleCardLayout();
  assert.ok(layout.hero.y < 330, '角色图应在卡片上部进入画面');
  assert.ok(layout.hero.height >= 650, '角色图应成为视觉主体');
  assert.ok(layout.scores.y < 260, '双指数应在首屏可见');
  assert.ok(layout.verdict.y > layout.hero.y, '判词应叠在主视觉下部而不是挤占顶部');
  assert.ok(layout.qr.y >= 1160, '二维码留在底部信息区');
});
