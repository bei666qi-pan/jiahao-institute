import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSceneState,sceneActions,applySceneAction} from '../../server/scene-mechanics.mjs';
const scene=id=>({id,character:'jiahao'});
test('the server owns prop changes; a model cannot add a player loan or arbitrary state',()=>{
 const s=scene('class-question'),state=initialSceneState(s);
 assert.throws(()=>applySceneAction(s,state,{action:'borrow_player_pen',content:'a pen'}));
 const result=applySceneAction(s,state,{action:'switch_book',state:{borrower:'player'}});
 assert.equal(result.state.book,'history');assert.equal(state.book,'physics');assert.equal(result.state.borrower,undefined);
 assert.match(result.event,/自己的书包/);
});
test('writing requires actual bounded content and stores it as the visible artifact',()=>{
 const s=scene('group-project'),state=initialSceneState(s);
 assert.throws(()=>applySceneAction(s,state,{action:'write',content:''}));
 const r=applySceneAction(s,state,{action:'write',content:'夜宵涨价比我们的作业进度快。'});
 assert.deepEqual(r.state.lines,['夜宵涨价比我们的作业进度快。']);assert.ok(r.event.includes(r.state.lines[0]));
});
test('deleting the picture prevents later model-selected restoration',()=>{
 const s=scene('photo');const r=applySceneAction(s,initialSceneState(s),{action:'delete_photo'});
 assert.equal(r.state.photoPresent,false);assert.ok(!sceneActions(s,r.state,false).includes('retake_plain'));
 assert.throws(()=>applySceneAction(s,r.state,{action:'retake_plain'}));
});
test('KTV starts after its opening mistake and cannot rewind into another preparation',()=>{
 const s=scene('ktv'),state=initialSceneState(s);
 assert.ok(!sceneActions(s,state,false).includes('miss_entry'));
 assert.throws(()=>applySceneAction(s,state,{action:'miss_entry'}));
 const end=applySceneAction(s,state,{action:'sing'},true);
 assert.match(end.state.performance,/手机/);
});
test('ending and ordinary scenes do not manufacture player actions',()=>{
 const s=scene('lunch-order'),r=applySceneAction(s,initialSceneState(s),{action:'reply'});
 assert.equal(r.event,'');assert.throws(()=>applySceneAction(s,r.state,{action:'player_swapped_lunch'}));
});

test('viewing an already retaken picture can hold the state without another fake action',()=>{
 const s=scene('photo');const first=applySceneAction(s,initialSceneState(s),{action:'retake_plain'});
 const second=applySceneAction(s,first.state,{action:'hold'});
 assert.deepEqual(second.state,first.state);assert.equal(second.event,'');
});

test('public prop views are copies and do not expose internal state fields',async()=>{
 const {sceneView}=await import('../../server/scene-mechanics.mjs');const s=scene('group-project');
 const state=applySceneAction(s,initialSceneState(s),{action:'write',content:'只展示这一行。'}).state;
 const view=sceneView(s,state);view.lines.push('客户端篡改');assert.deepEqual(state.lines,['只展示这一行。']);assert.equal('version' in view,false);
 const photo=scene('photo');assert.equal(sceneView(photo,applySceneAction(photo,initialSceneState(photo),{action:'delete_photo'}).state).present,false);
});

test('a second photograph does not pretend to disable an already disabled filter',()=>{
 const s=scene('photo'),first=applySceneAction(s,initialSceneState(s),{action:'retake_plain'});
 const second=applySceneAction(s,first.state,{action:'retake_plain'});
 assert.doesNotMatch(second.event,/关闭滤镜|恢复/);assert.match(second.event,/又拍/);
});
test('singing renders an actual authored lyric, never a model stage direction, and cannot regress to preparation',()=>{
 const s=scene('ktv'),first=applySceneAction(s,initialSceneState(s),{action:'sing',content:'轻哼一段，等字幕出来'});
 assert.doesNotMatch(first.state.performance,/等字幕|轻哼一段/);
 assert.match(first.state.performance,/手机/);
 assert.ok(!sceneActions(s,first.state).includes('miss_entry'));
 const together=applySceneAction(s,first.state,{action:'original_on'});
 assert.equal(together.state.original,true);assert.match(together.event,/打开原唱/);
});
test('a requested pose demonstration changes the visible pose without changing the photo or filter',()=>{
 const s=scene('photo'),before=initialSceneState(s),r=applySceneAction(s,before,{action:'pose_demo'});
 assert.equal(r.state.demonstrated,true);assert.equal(r.state.filter,true);assert.equal(r.state.retakes,0);
 assert.match(r.event,/举.*手机/);assert.match(r.event,/下巴/);
});
test('a generic admission cannot manufacture a fact about what the character said',async()=>{
 const {sceneFacts}=await import('../../server/scene-mechanics.mjs');
 for(const id of ['ktv','class-question','group-project']){
  const s=scene(id),state=initialSceneState(s);
  assert.ok(!sceneActions(s,state).includes('admit'));
  assert.doesNotMatch(sceneFacts(s,{...state,conceded:true}).join(' '),/承认|已经认/);
 }
});
test('listen-only is a remembered player boundary until the player explicitly opts into singing',async()=>{
 const {updateSceneIntent,sceneContract}=await import('../../server/scene-mechanics.mjs');const s=scene('ktv');
 const first=updateSceneIntent(s,initialSceneState(s),'我刚下晚班，没力气唱，你唱两句我听听就好。');
 assert.equal(first.listenOnly,true);
 const next=updateSceneIntent(s,first,'这句挺像我，再来一句就歇吧。');assert.equal(next.listenOnly,true);
 assert.match(sceneContract(s,next,false).playerBoundary,/只听/);
 assert.equal(updateSceneIntent(s,next,'我也想唱一句了').listenOnly,false);
 assert.equal(updateSceneIntent(s,next,'我也不想唱').listenOnly,true);
 assert.equal(updateSceneIntent(s,next,'我也想等你唱').listenOnly,true);
 assert.equal(first.listenOnly,true);
});
test('canteen ownership stays with the right player and the last dish can only be taken once',async()=>{
 const {sceneFacts,explicitSceneExit}=await import('../../server/scene-mechanics.mjs');const s={id:'canteen',character:'nailoong'},initial=initialSceneState(s);
 const next=applySceneAction(s,initial,{action:'take_last'});
 assert.equal(next.state.plate,'last-dish');assert.match(sceneFacts(s,next.state).join(' '),/玩家.*两个/);assert.match(sceneFacts(s,next.state).join(' '),/奶龙.*一份/);
 assert.throws(()=>applySceneAction(s,next.state,{action:'take_last'}));
 assert.equal(explicitSceneExit('不用记着，下次谁先到谁买。我先去吃了。'),true);
});
test('the work notice starts with a concrete contradiction and a revision changes the actual draft',async()=>{
 const {SCENES}=await import('../../server/scene-catalog.mjs');const {sceneFacts,sceneView}=await import('../../server/scene-mechanics.mjs');const s=SCENES.find(x=>x.id==='overtime'),state=initialSceneState(s);
 assert.match(s.evidence,/准时提前/);assert.match(sceneFacts(s,state).join(''),/准时提前/);
 const r=applySceneAction(s,state,{action:'revise_notice',content:'活动明天下午三点开始。'});
 assert.deepEqual(sceneView(s,r.state).lines,['活动明天下午三点开始。']);assert.ok(r.event.includes('活动明天下午三点开始。'));
});
test('revising a document replaces the old text instead of appending a duplicate question',()=>{
 const s=scene('group-project');const first=applySceneAction(s,initialSceneState(s),{action:'write',content:'1. 何时去食堂？\n2. 怎么选队？\n3. 排队慢过吗？'});
 const revised='1. 何时去食堂？\n2. 怎么选队？\n3. 前面几人、等了多久？不记得就写不记得。';
 const next=applySceneAction(s,first.state,{action:'revise_document',content:revised});
 assert.deepEqual(next.state.lines,[revised]);assert.match(next.event,/改为/);assert.equal(next.state.lines.join('').split('3.').length,2);
 assert.throws(()=>applySceneAction(s,next.state,{action:'revise_document',content:''}));
});
test('an explicit request to write or revise the shared draft cannot complete as an empty promise',async()=>{
 const {sceneContract}=await import('../../server/scene-mechanics.mjs'),s=scene('group-project'),state=initialSceneState(s);
 assert.deepEqual(sceneContract(s,state,false,'咱们别编数据，我去问室友排队经历，你先写三个采访问题怎么样？').allowedActions,['write']);
 const written=applySceneAction(s,state,{action:'write',content:'1. 什么时候吃饭？\n2. 怎么选队？\n3. 等了多久？'}).state;
 assert.deepEqual(sceneContract(s,written,false,'第三题加一句，不记得就写不记得。').allowedActions,['revise_document']);
 assert.ok(sceneContract(s,written,false,'不用写了，先歇会儿').allowedActions.includes('hold'));
});
test('a normal work goodbye closes the scene even with a polite see-you-tomorrow suffix',async()=>{
 const {explicitSceneExit,sceneContract}=await import('../../server/scene-mechanics.mjs'),s=scene('overtime');
 assert.equal(explicitSceneExit('改好了，我先下班了，明天见。'),true);
 assert.deepEqual(sceneContract(s,initialSceneState(s),false,'改好了，我先下班了，明天见。').allowedActions,['close']);
 assert.equal(explicitSceneExit('别以为我先下班了，我还在公司呢。'),false);
});
