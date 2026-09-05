import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneService } from '../../server/scenes.mjs';
const reply = { action:'reply',move:{action:'reply'}, reply: '嘉豪把闹钟递给你：下次让它先来打卡。', event: '同事把闹钟放在了你的工位上。', angles: ['认领闹钟', '解释迟到'], ending: '闹钟成了全组唯一全勤员工。' };
const fixtureMove=id=>({action:({overtime:'hold',canteen:'hold','class-question':'switch_book','group-project':'write',photo:'retake_plain',ktv:'sing'})[id]||'reply',content:'测试中实际写出或唱出的内容'});
const make = (opts = {}) => new SceneService({ secret: 'unit-scene-secret', generate: async ({scene}) => ({...reply,move:fixtureMove(scene.id)}), ...opts });
const start = (s, extra = {}) => s.turn('alice', {sceneId:'late', input:'我替闹钟请假', idempotencyKey:'first-key', ...extra});
test('signed progress cannot be forged or transferred to another visitor', async () => {
 const s=make(); const r=await start(s); assert.equal(r.turn,1);
 await assert.rejects(s.turn('bob',{sceneId:'late',token:r.token,input:'接招',idempotencyKey:'next'}), /续玩/);
 await assert.rejects(s.turn('alice',{sceneId:'late',token:r.token+'x',input:'接招',idempotencyKey:'next'}), /续玩/);
});
test('three successful turns complete a run and prohibit a fourth', async () => {
 const s=make(); let r=await start(s);
 for(let i=2;i<=3;i++)r=await s.turn('alice',{sceneId:'late',token:r.token,input:'把闹钟交给老板',idempotencyKey:`key-${i}`});
 assert.equal(r.status,'completed'); assert.equal(r.turns.length,3); assert.equal(r.ending,reply.ending);
 await assert.rejects(s.turn('alice',{sceneId:'late',token:r.token,input:'再来',idempotencyKey:'fourth'}),/结束/);
});
test('concurrent duplicate action consumes one generation and returns identical continuation',async()=>{
 let calls=0;const s=make({generate:async()=>{calls++;await new Promise(r=>setTimeout(r,15));return reply;}});
 const [a,b]=await Promise.all([start(s),start(s)]);assert.equal(calls,1);assert.equal(a.token,b.token);
 await assert.rejects(start(s,{input:'另一句话'}),/重复/);
});
test('a previous step cannot fork with a changed key or input',async()=>{
 const s=make();const r=await start(s);const payload={sceneId:'late',token:r.token,input:'认了',idempotencyKey:'second'};
 const a=await s.turn('alice',payload);const b=await s.turn('alice',{...payload,idempotencyKey:'new-key'});assert.equal(a.token,b.token);
 await assert.rejects(s.turn('alice',{...payload,input:'不认'}),/重复/);
});
test('invalid model structure is rejected without manufacturing a successful turn',async()=>{
 const s=make({generate:async()=>({reply:'不错'})});await assert.rejects(start(s),/结构/);
});
test('expired continuation is refused',async()=>{
 let now=1000;const s=make({now:()=>now});const r=await start(s);now+=86400001;
 await assert.rejects(s.turn('alice',{sceneId:'late',token:r.token,input:'继续',idempotencyKey:'next'}),/续玩/);
});
test('ending early produces an honest local ending without extra model call',async()=>{
 let calls=0;const s=make({generate:async()=>{calls++;return reply;}});const r=await start(s);
 const end=await s.turn('alice',{sceneId:'late',token:r.token,input:'',action:'end',idempotencyKey:'end'});
 assert.equal(end.status,'completed');assert.equal(end.turns.length,1);assert.equal(calls,1);assert.ok(end.ending);
});
test('sharing requires explicit confirmation and a finished signed run',async()=>{
 const s=make();const r=await start(s);
 await assert.rejects(s.createShare('alice',{token:r.token,momentIndex:0,confirmed:true}),/结束/);
 const end=await s.turn('alice',{sceneId:'late',token:r.token,action:'end',idempotencyKey:'end'});
 await assert.rejects(s.createShare('alice',{token:end.token,momentIndex:0}),/确认/);
});
test('restarting the process fails closed on a previous signed step instead of duplicating generation',async()=>{
 const first=make();const r=await start(first);const second=make();
 await assert.rejects(second.turn('alice',{sceneId:'late',token:r.token,input:'继续',idempotencyKey:'next'}),/续玩/);
});

test('model adapter sends the runtime provider and reports real usage without leaking content into telemetry',async()=>{
 const {createSceneGenerator}=await import('../../server/scenes.mjs');
 let sent,observed;
 const generate=createSceneGenerator({resolveProvider:async()=>({id:'test-provider',base:'https://model.invalid/v1',model:'runtime-model',key:'fixture-key',prices:{}}),fetchImpl:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(reply)}}],usage:{prompt_tokens:17,completion_tokens:21}}));},observe:async(req,event)=>{observed=event;}});
 const s=make({generate});const r=await start(s);assert.equal(r.reply,reply.reply);assert.equal(sent.body.model,'runtime-model');assert.equal(sent.url,'https://model.invalid/v1/chat/completions');assert.equal(observed.inputTokens,17);assert.equal(observed.outputTokens,21);assert.equal(JSON.stringify(observed).includes('闹钟'),false);
});

test('model adapter rejects incomplete provider JSON and records a failed request',async()=>{
 const {createSceneGenerator}=await import('../../server/scenes.mjs');let event;
 const generate=createSceneGenerator({resolveProvider:async()=>({id:'test',base:'https://model.invalid',model:'fixture',key:'fixture'}),fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'{"reply":"hello"}'}}],usage:{prompt_tokens:4,completion_tokens:2}})),observe:async(req,e)=>{event=e;}});
 await assert.rejects(start(make({generate})),/结构/);assert.equal(event.ok,false);assert.equal(event.outputTokens,2);assert.equal(event.errorCode,'SCENE_MODEL_INVALID');
});

test('total model timeout includes waiting for runtime configuration',async()=>{
 const {createSceneGenerator}=await import('../../server/scenes.mjs');
 let fetched=false;
 const generate=createSceneGenerator({timeoutMs:5,fetchImpl:async()=>{fetched=true;return new Response('{}');},resolveProvider:async()=>{await new Promise(r=>setTimeout(r,35));return {key:'fixture',base:'https://model.invalid'};},observe:async()=>{}});
 await assert.rejects(start(make({generate})),error=>error.code==='SCENE_RESULT_UNCERTAIN');
 assert.equal(fetched,false);
});

test('HTTP API binds the anonymous cookie, blocks cross-origin writes and exposes explicit retry semantics',async()=>{
 const {createServer}=await import('node:http');let calls=0;
 const s=make({generate:async()=>{calls++;if(calls===1)return {};return reply;}});
 const server=createServer((req,res)=>void s.handle(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const initial=await fetch(`${base}/api/scenes`);const cookie=initial.headers.get('set-cookie').split(';')[0];const catalog=await initial.json();assert.ok(catalog.scenes.some(scene=>scene.id==='late'));
  const payload={sceneId:'late',input:'接招',idempotencyKey:'http-start'};
  const post=async(body,extra={})=>fetch(`${base}/api/scenes/turn`,{method:'POST',headers:{cookie,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
  assert.equal((await post(payload,{origin:'https://other.invalid'})).status,403);
  const failed=await post(payload);assert.equal(failed.status,502);assert.equal((await failed.json()).retryable,true);
  assert.equal((await post(payload)).status,502);assert.equal(calls,1);
  const retried=await post({...payload,idempotencyKey:'http-explicit-retry'});assert.equal(retried.status,200);const r=await retried.json();assert.equal(r.turn,1);
  const stolen=await post({...payload,token:r.token,idempotencyKey:'stolen'},{cookie:''});assert.equal(stolen.status,401);assert.equal((await stolen.json()).runExpired,true);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('a malformed third response never completes the run; explicit retry preserves the same player history',async()=>{
 let attempts=0;
 const s=make({generate:async({turns,final})=>{
  attempts++;
  if(final){
   assert.deepEqual(turns.map(v=>v.input),['我明天再去买','两个蛋糕加一瓶饮料']);
   if(attempts===3)return {reply:'角色回应',event:'角色点头',angles:['收场']};
  }
  return reply;
 }});
 let r=await start(s,{input:'我明天再去买'});
 r=await s.turn('alice',{sceneId:'late',token:r.token,input:'两个蛋糕加一瓶饮料',idempotencyKey:'second'});
 const third={sceneId:'late',token:r.token,input:'这就说定了',idempotencyKey:'third'};
 await assert.rejects(s.turn('alice',third),error=>error.code==='SCENE_MODEL_INVALID');
 await assert.rejects(s.turn('alice',third),error=>error.code==='SCENE_MODEL_INVALID');
 assert.equal(attempts,3);
 const end=await s.turn('alice',{...third,idempotencyKey:'third-explicit-retry'});
 assert.equal(end.turn,3);assert.equal(end.status,'completed');assert.equal(attempts,4);
 assert.deepEqual(end.turns.map(v=>v.input),['我明天再去买','两个蛋糕加一瓶饮料','这就说定了']);
});

test('daily scenes expose categories and each classroom or work entrance can start a signed run',async()=>{
 const {createServer}=await import('node:http');const s=make();const server=createServer((req,res)=>void s.handle(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const catalog=await(await fetch(`http://127.0.0.1:${server.address().port}/api/scenes`)).json();
  for(const id of ['class-question','group-project','class-presentation','library-seat','canteen','overtime','screen-share','elevator','lunch-order']){
   const scene=catalog.scenes.find(x=>x.id===id);assert.ok(scene,`${id} must be discoverable`);assert.ok(['校园','工作'].includes(scene.category));
   const result=await s.turn('alice',{sceneId:id,input:'我先听听你怎么说',idempotencyKey:id});assert.equal(result.sceneId,id);assert.equal(result.turn,1);
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});

test('a spoken reply needs no fabricated stage action; final closing reuses the spoken reply',async()=>{
 const {createSceneGenerator}=await import('../../server/scenes.mjs');
 const generate=createSceneGenerator({resolveProvider:async()=>({id:'fixture',base:'https://model.invalid',model:'fixture',key:'fixture'}),fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({action:'reply',reply:'行，你忙完叫我。',event:'',angles:['先忙自己的事']})}}]}))});
 const s=make({generate});let result=await start(s);assert.equal(result.event,'');
 for(let i=0;i<2;i++)result=await s.turn('alice',{sceneId:'late',token:result.token,input:'嗯',idempotencyKey:`short-${i}`});
 assert.equal(result.status,'completed');assert.equal(result.ending,'行，你忙完叫我。');assert.equal(result.turn,3);
});

test('after the opening, suggestions cannot invent new obligations or undo a completed action',async()=>{
 const {createSceneGenerator}=await import('../../server/scenes.mjs');let sent;
 const generate=createSceneGenerator({resolveProvider:async()=>({id:'fixture',base:'https://model.invalid',model:'fixture',key:'fixture'}),fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({action:'delete_photo',reply:'删好了。',event:'按下删除键',angles:['再看看刚删的照片']})}}]}))}});
 const output=await generate({scene:{id:'photo'},turns:[],input:'删掉吧',final:false});
 assert.deepEqual(output.angles,[]);
 assert.ok(!sent.messages[0].content.includes('angles是'));
});

test('a player can inspect the same concrete comic premise exposed to the generator',async()=>{
 const {SCENES}=await import('../../server/scene-catalog.mjs');
 for(const id of ['class-question','group-project','photo','ktv']){
  const scene=SCENES.find(s=>s.id===id);assert.ok(scene.evidence?.length>8,`${id} needs visible evidence, not secret evaluation facts`);
  const s=make({generate:async({scene:received})=>{assert.equal(received.evidence,scene.evidence);return {...reply,move:fixtureMove(received.id)}}});
  assert.equal((await s.turn('alice',{sceneId:id,input:'你给我演示一下',idempotencyKey:id})).turn,1);
 }
});

test('temporary reservation storage failure is explicitly retryable without consuming a model',async()=>{
 let calls=0,available=false;
 const pool={query:async()=>{if(!available)throw new Error('db unavailable');return {rowCount:1,rows:[]}}};
 const s=make({pool,generate:async()=>{calls++;return reply}});
 await assert.rejects(start(s),e=>e.code==='SCENE_STORAGE_UNAVAILABLE');assert.equal(calls,0);
 available=true;assert.equal((await start(s,{idempotencyKey:'explicit-storage-retry'})).turn,1);assert.equal(calls,1);
});

test('model only receives meanings of allowed actions and explicit departures close the scene',async()=>{
 const {createSceneGenerator}=await import('../../server/scenes.mjs');let sent;
 const generate=createSceneGenerator({resolveProvider:async()=>({id:'test',base:'https://model.invalid',model:'fixture',key:'fixture'}),fetchImpl:async(url,options)=>{sent=JSON.parse(JSON.parse(options.body).messages[1].content);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({reply:'好，我收着。',action:'close',content:''})}}]}));}});
 await generate({scene:{id:'photo',character:'jiahao'},turns:[],input:'我不想点评，你收起来吧，我先忙了。',final:false});
 assert.deepEqual(sent.contract.allowedActions,['close']);
 assert.deepEqual(Object.keys(sent.contract.actionMeaning),['close']);
});
test('a shared earlier moment includes the previewed final player line, never the middle turn',async()=>{
 let saved;const s=make({pool:{query:async(sql,args)=>{saved=args;return {rows:[],rowCount:1}}}});
 const token=s.sign({kind:'scene-v1',owner:'alice',sceneId:'photo',expires:Date.now()+10000,status:'completed',turns:[{input:'首招',reply:'第一句',event:'关滤镜'},{input:'不公开的中间原句',reply:'中间回复',event:''},{input:'给门框颁奖',reply:'最后挽尊',event:''}],ending:'最后挽尊'});
 await s.createShare('alice',{token,momentIndex:0,confirmed:true,includeClosingInput:true});
 const moment=JSON.parse(saved[3]);assert.equal(moment.closingInput,'给门框颁奖');assert.equal(JSON.stringify(saved).includes('不公开的中间原句'),false);
 await s.createShare('alice',{token,momentIndex:2,confirmed:true,includeClosingInput:true});assert.equal(JSON.parse(saved[3]).closingInput,undefined);
 await s.createShare('alice',{token,momentIndex:0,confirmed:true});assert.equal(JSON.parse(saved[3]).closingInput,undefined);
});
test('M3 uses one bounded fast call and never returns private reasoning in the scene',async()=>{
 const {createSceneGenerator}=await import('../../server/scenes.mjs');let sent,calls=0;
 const generate=createSceneGenerator({resolveProvider:async()=>({id:'minimax',base:'https://model.invalid',model:'MiniMax-M3',key:'fixture'}),fetchImpl:async(url,options)=>{calls++;sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{reasoning_details:[{text:'PRIVATE_REASONING'}],content:JSON.stringify({reply:'我收着。',action:'hold',content:''})}}]}));}});
 const result=await generate({scene:{id:'photo',character:'jiahao'},turns:[],input:'嗯',final:false});
 assert.deepEqual(sent.thinking,{type:'disabled'});assert.equal(sent.reasoning_split,true);assert.equal(calls,1);assert.equal(JSON.stringify(result).includes('PRIVATE_REASONING'),false);assert.ok(sent.max_tokens<=3000);
});
