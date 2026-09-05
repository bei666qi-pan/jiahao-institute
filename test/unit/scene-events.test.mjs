import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductEvent } from '../../server/observability.mjs';

test('scene funnel distinguishes completion, copy, download and recipient without storing content', () => {
  for (const name of ['scene_started','scene_turn_completed','scene_completed','scene_recipient_completed','scene_replayed','scene_share_confirmed','scene_share_copied','scene_share_cancelled','scene_share_revoked','scene_card_downloaded']) {
    assert.deepEqual(normalizeProductEvent({name,properties:{sceneId:'snack',turn:2,status:'playing',fromShare:true,input:'private words',token:'private credential'}}), {
      name,properties:{sceneId:'snack',turn:2,status:'playing',fromShare:true},
    });
  }
});
