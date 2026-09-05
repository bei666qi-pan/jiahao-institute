import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneCardDestination } from '../../src/features/scenes/sceneCardDestination.js';
test('未公开卡片只携带同题入口，已确认卡片指向分享挑战', () => {
  assert.equal(sceneCardDestination({ sceneId: 'wrong-group', origin: 'https://example.test' }), 'https://example.test/play/wrong-group');
  assert.equal(sceneCardDestination({ sceneId: 'wrong-group', shareUrl: '/s/confirmed', origin: 'https://example.test' }), 'https://example.test/s/confirmed');
});
