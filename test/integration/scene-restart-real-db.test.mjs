import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {SceneService} from '../../server/scenes.mjs';
test('first request cannot consume a second model after a process restart; reservations contain no conversation',async()=>{
 assert.ok(process.env.TEST_DATABASE_URL,'A real isolated database is required');
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,ssl:false});let calls=0;const owner=randomUUID();
 const generate=async()=>{calls++;return {reply:'我先收着。',event:'',angles:[],ending:null,move:{action:'reply'}}};
 try{
  await pool.query(await readFile(new URL('../../server/migrations/010_scene_requests.sql',import.meta.url),'utf8'));
  const first=new SceneService({secret:'test-only',pool,generate});
  const request={sceneId:'late',input:'不要保存我的这句话',idempotencyKey:randomUUID()};
  const done=await first.turn(owner,request);assert.equal(done.turn,1);
  const restarted=new SceneService({secret:'test-only',pool,generate});
  await assert.rejects(restarted.turn(owner,request),e=>e.code==='SCENE_RESTARTED');assert.equal(calls,1);
  const rows=(await pool.query('select * from jh_scene_requests')).rows;
  assert.ok(rows.length);assert.ok(!JSON.stringify(rows).includes(request.input));assert.ok(!JSON.stringify(rows).includes(done.token));
 }finally{await pool.end()}
});
