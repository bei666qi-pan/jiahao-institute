// Game facts are projected by code. Model prose never writes a player's action or possession.
const invalid=()=>Object.assign(new Error('这次动作没有对上现场，进度未改变。'),{code:'SCENE_MODEL_INVALID',statusCode:502});
const names={jiahao:'嘉豪',nailoong:'奶龙'};
export function initialSceneState(scene){
 switch(scene.id){
  case 'overtime':return {version:1,lines:['活动将于明天下午三点准时提前开始。']};
  case 'canteen':return {version:1,plate:'empty'};
  case 'class-question':return {version:1,book:'physics',note:''};
  case 'group-project':return {version:1,lines:[]};
  case 'photo':return {version:1,filter:true,photoPresent:true,deleted:false,retakes:0,demonstrated:false};
  case 'ktv':return {version:1,misses:0,performance:'',original:false};
  default:return {version:1};
 }
}
export function sceneActions(scene,state,final=false){
 switch(scene.id){
  case 'overtime':return ['revise_notice','hold','close'];
  case 'canteen':return [...(state.plate==='empty'?['take_last','split_last']:[]),'hold','close'];
  case 'class-question':return [...(state.book==='physics'?['switch_book']:[]),'explain','hold','close'];
  case 'group-project':return ['write',...(state.lines.length?['revise_document']:[]),'hold','close'];
  case 'photo':return [...(!state.deleted?['retake_plain','delete_photo']:[]),'pose_demo','hold','close'];
  case 'ktv':return ['sing',...(!state.original?['original_on']:[]),'hold','close'];
  default:return ['reply','close'];
 }
}
export function applySceneAction(scene,state,move,final=false){
 if(!move||!sceneActions(scene,state,final).includes(move.action))throw invalid();
 const next=structuredClone(state),name=names[scene.character]||'角色';let event='';
 const content=()=>{if(typeof move.content!=='string'||!move.content.trim()||move.content.length>(move.action==='revise_document'?500:120))throw invalid();return move.content.trim()};
 switch(move.action){
  case 'revise_notice':next.lines=[content()];event=`${name}把通知改成：“${next.lines[0]}”`;break;
  case 'take_last':next.plate='last-dish';event='奶龙接过最后一份糖醋里脊，放进自己的餐盘。';break;
  case 'split_last':next.plate='half';event='奶龙把最后一份糖醋里脊分成两半，自己留一半，另一半留在旁边。';break;
  case 'switch_book':next.book='history';event=`${name}把物理书放回自己的书包，换出近代史课本。`;break;
  case 'explain':next.note=content();event=`${name}在自己的草稿纸上写下：“${next.note}”`;break;
  case 'revise_document':next.lines=[content()];event=`${name}把文档正文改为：“${next.lines[0]}”`;break;
  case 'write':next.lines.push(content());event=`${name}在文档中添了一段：“${next.lines.at(-1)}”`;break;
  case 'retake_plain':next.filter=false;next.photoPresent=true;next.retakes++;event=state.filter?`${name}关闭滤镜，重新拍了一张。门框恢复了直线。`:`${name}又拍了一张原片，滤镜保持关闭，门框仍然是直的。`;break;
  case 'pose_demo':next.demonstrated=true;event=`${name}举起手机，高过眼睛，收着下巴给你示范。`;break;
  case 'delete_photo':next.photoPresent=false;next.deleted=true;event=`${name}删除了这张照片，屏幕回到相机界面。`;break;
  case 'original_on':next.original=true; // Turning on the backing track also sings the next line.
  case 'sing':next.performance=state.performance?'明天我一定早睡，今天先替明天熬。':'最后看一眼手机，怎么窗外又亮了。';event=`${move.action==='original_on'?`${name}打开原唱，跟着唱：`:`${name}踩着字幕唱：`}“${next.performance}”`;break;
  case 'close':next.closed=true;if(scene.id==='photo'){next.phoneAway=true;event=`${name}收起手机，这次不再给你看了。`;}if(scene.id==='overtime')event='嘉豪收回通知，没再拦着电梯。';if(scene.id==='canteen')event=state.plate==='empty'?'奶龙让开取餐口，不再叫住你。':'奶龙端着自己的那份菜去找座位，不再叫住你。';break;
 }
 return {state:next,event,move:{action:move.action,...(['explain','write','revise_notice','revise_document'].includes(move.action)?{content:move.content.trim()}:{})}};
}
export function sceneFacts(scene,state){
 switch(scene.id){
  case 'overtime':return [`嘉豪手里的通知：${state.lines.join('\n')}`];
  case 'canteen':return ['玩家原有两个肉菜，没有给奶龙。',state.plate==='empty'?'最后一份糖醋里脊还在窗口，奶龙没拿到。':state.plate==='half'?'奶龙拿到半份糖醋里脊，另一半留在旁边。':'奶龙只有刚拿到的这一份糖醋里脊。'];
  case 'class-question':return [`嘉豪手里的书：${state.book==='physics'?'大学物理':'近代史'}`,`嘉豪的草稿：${state.note||'还没写'}`];
  case 'group-project':return [`文档正文：${state.lines.length?state.lines.join('\n'):'还没有内容'}`];
  case 'photo':return [state.photoPresent?`照片还在；${state.filter?'滤镜开着，门框是弯的':'滤镜已关，门框是直的'}`:'这张照片已删除',...(state.phoneAway?['嘉豪已经收起手机']:[]),...(state.demonstrated?['嘉豪已举高手机、收下巴，做过示范']:[])];
  case 'ktv':return [state.performance?`已经唱出：${state.performance}`:state.misses?'已经抢拍一次，还没完整开唱':'刚才抢在歌词前唱了两句'];
  default:return [];
 }
}
// Remember explicit participation choices, not inferred sentiment or hidden relationship scores.
export function updateSceneIntent(scene,state,input){
 const next=structuredClone(state);
 if(scene.id==='ktv'){
  if(/我(?:真(?:的)?|也|还是|今天|现在|暂时)?不(?:想|愿意)?唱|(?:没|没有)力气唱|只(?:想)?听|你唱[^。！？]*我听/.test(input))next.listenOnly=true;
  else if(/我(?:也)?(?:来|想|可以|试着)(?:一起)?唱/.test(input))next.listenOnly=false;
 }
 return next;
}
export function explicitSceneExit(input){
 return /(?:^|[，,。.!！])\s*(?:我)?(?:先下班了|先走了|先忙了|先去吃了|先去吃饭了|不聊了|不玩了|就到这(?:里)?吧)(?:[，,]\s*明天见)?[。！!\s]*$/.test(input);
}
export function sceneContract(scene,state,final,input=''){
 let allowedActions=explicitSceneExit(input)?['close']:sceneActions(scene,state,final);
 // A requested edit is an artifact operation, not a promise to perform it later.
 const asksToEdit=/(?:你|请|帮我|先)[^。！？]*(?:写|列|改|删|补)|(?:加|补)(?:上|一句)|删掉/.test(input);
 const declinesEdit=/(?:不|别|不用|不要|无需)(?:再)?(?:写|改|列|补|删)/.test(input);
 if(scene.id==='group-project'&&!explicitSceneExit(input)&&asksToEdit&&!declinesEdit)allowedActions=[state.lines.length?'revise_document':'write'];
 const contract={allowedActions,facts:sceneFacts(scene,state),playerBoundary:state.listenOnly?'玩家已明确只听不唱，而且没有改口。台词只说嘉豪自己怎么唱，不让玩家热麦、接句、跟唱、数拍；不再邀请他唱。':'',
  actionMeaning:{revise_document:'修改或删除已有文档内容；content是修改后的完整正文，保留没要求改的内容，最多500字。不要用write重复追加旧条目',revise_notice:'嘉豪当场改自己手里的通知；content填改后的实际句子，最多120字，不是承诺，也不发送任何通知',take_last:'奶龙接过窗口最后一份菜；玩家的两个肉菜没有转给他',split_last:'奶龙分好最后一份菜，各留一半，不擅自拿玩家原有的菜',hold:'只说话，物品不动；玩家只看照片、问自己的拍照方法、肯定结果或闲聊时用，不要让嘉豪重拍自己的自拍',switch_book:'从嘉豪自己的包里换对课本',explain:'在自己的纸上实际写出一句解释，content是纸上原文',write:'实际向文档追加一小段，content是正文原文，不是承诺或写作指令',pose_demo:'嘉豪当场举高手机、收下巴示范；玩家要看怎么拿手机时选此动作，不拍新照片，不改变滤镜',retake_plain:'仅当玩家明确要看嘉豪的新照片时，关滤镜重拍；不是玩家在问自己的拍照方法',delete_photo:'删除当前照片，之后不能恢复',miss_entry:'自己抢拍一次；不能连续等待',sing:'唱游戏原创歌曲《下次一定早睡》的下一句，系统显示歌词；不需要content，不再停在前奏',original_on:'打开原唱并跟唱下一句；系统完成并显示歌词，不需要content',close:'当场结束；自拍场景收起手机。不能预告下次发照片、不能再教一招、不能提问或安排别人',reply:'仅说话，不改变任何物品或他人状态'},
  completedTurn:final||explicitSceneExit(input),actor:scene.character,maxContentLength:120,maxReplyLength:100};
 contract.actionMeaning=Object.fromEntries(allowedActions.map(action=>[action,contract.actionMeaning[action]]));
 return contract;
}

export function sceneView(scene,state){
 switch(scene.id){
  case 'overtime':return {kind:'document',label:'这份通知',lines:[...state.lines]};
  case 'class-question':return {kind:'book',label:state.book==='physics'?'大学物理':'近代史',note:state.note};
  case 'group-project':return {kind:'document',lines:[...state.lines]};
  case 'photo':return {kind:'photo',filter:state.filter,present:state.photoPresent};
  case 'ktv':return {kind:'song',performance:state.performance};
  default:return null;
 }
}
