import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {SceneService} from '../../server/scenes.mjs';

// Synthetic generator tests storage and rules, not real model quality.
const fixture={move:{action:'reply'},reply:'奶龙把闹钟递给你：它比你敬业。',event:'你的工位上多了一个闹钟。',angles:['认领闹钟'],ending:'闹钟拿到了全勤。'};
test('Postgres sharing stores only a confirmed selected moment; isolates owners and clears revoked/expired text',async()=>{
 assert.ok(process.env.TEST_DATABASE_URL,'TEST_DATABASE_URL is required; database validation must not silently skip');
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,ssl:false});
 const owner=randomUUID(),other=randomUUID();let now=Date.now();
 const s=new SceneService({pool,secret:'isolated-test-key',generate:async()=>fixture,now:()=>now});
 try{
  await pool.query(await readFile(new URL('../../server/migrations/010_scene_requests.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../../server/migrations/009_scene_shares.sql',import.meta.url),'utf8'));
  let r=await s.turn(owner,{sceneId:'late',input:'一号原话',idempotencyKey:randomUUID()});
  r=await s.turn(owner,{sceneId:'late',input:'二号原话',token:r.token,idempotencyKey:randomUUID()});
  r=await s.turn(owner,{sceneId:'late',input:'三号原话',token:r.token,idempotencyKey:randomUUID()});
  await assert.rejects(s.createShare(owner,{token:r.token,momentIndex:1}),/确认/);
  assert.equal((await pool.query('select count(*)::int n from jh_scene_shares where owner_id=$1',[owner])).rows[0].n,0);
  const share=await s.createShare(owner,{token:r.token,momentIndex:1,confirmed:true});
  const stored=(await pool.query('select * from jh_scene_shares where code=$1',[share.code])).rows[0];
  assert.equal(stored.moment.input,'二号原话');assert.equal(JSON.stringify(stored).includes('一号原话'),false);assert.equal(JSON.stringify(stored).includes('三号原话'),false);
  const publicView=await s.readShare(other,share.code);assert.equal(publicView.isOwner,false);assert.equal(publicView.available,true);assert.equal('owner_id' in publicView,false);assert.equal('token' in publicView,false);
  await assert.rejects(s.revokeShare(other,share.code),/创建者/);assert.equal((await s.readShare(owner,share.code)).available,true);
  await s.revokeShare(owner,share.code);const revoked=await s.readShare(other,share.code);assert.equal(revoked.available,false);assert.equal(revoked.sceneId,'late');assert.equal('moment'in revoked,false);
  assert.equal((await pool.query('select moment,ending from jh_scene_shares where code=$1',[share.code])).rows[0].moment,null);
  const expiring=await s.createShare(owner,{token:r.token,momentIndex:0,confirmed:true});now+=7*86400000+1;
  const expired=await s.readShare(other,expiring.code);assert.equal(expired.available,false);assert.equal(expired.sceneId,'late');assert.equal('ending'in expired,false);
  assert.deepEqual((await pool.query('select moment,ending from jh_scene_shares where code=$1',[expiring.code])).rows[0],{moment:null,ending:null});
 }finally{await pool.query('delete from jh_scene_shares where owner_id=$1',[owner]);await pool.end();}
});
