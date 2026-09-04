import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { makeSocialResultPayload } from '../../validation';
import { trackProductEvent } from '../../telemetry';

function scoreOf(member, field, fallback = '--') {
  const value = field === 'jiahao' ? member.score : member.nailoong?.score ?? member.nailoongScore;
  if (value === null || value === undefined || value === '') return fallback;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function RecoveryNotice({ code }) {
  if (!code) return null;
  return <section className="league-recovery" role="status"><div><span>只显示这一次</span><h2>保存你的恢复口令</h2><p>换设备时可用它找回联赛；我们不保存明文。</p></div><code>{code}</code></section>;
}

function makeIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-4000-8000-${Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12)}`;
}

function LeagueRoom({ data, roomCode, nickname, onNickname, busy, error, notice, recoveryCode, onJoin, onShare, onReload, onBack }) {
  const [answer, setAnswer] = useState('');
  const [consent, setConsent] = useState(false);
  const [shareAnswer, setShareAnswer] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [localError, setLocalError] = useState('');
  const [working, setWorking] = useState(false);
  const room = data?.room;
  const round = data?.round;
  const season = data?.season;
  const submissionScope = `${season?.number || 0}:${round?.date || 'none'}`;
  const idempotencyKey = useMemo(makeIdempotencyKey, [submissionScope]);
  const currentDay = Math.min(7, Math.max(1, Number(season?.day) || 1));

  useEffect(() => {
    setAnswer('');
    setConsent(false);
    setShareAnswer(false);
    setConfirming(false);
    setLocalError('');
  }, [submissionScope]);

  const submit = async () => {
    if (!confirming) {
      if (answer.trim().length < 2) return setLocalError('至少写 2 个字。');
      if (!consent) return setLocalError('请先同意联赛答案公开规则。');
      setLocalError(''); setConfirming(true); return;
    }
    setWorking(true); setLocalError('');
    trackProductEvent('lab_game_started', { game: 'league_daily', character: round?.character, roundDay: season?.day });
    try {
      await postJson(`/api/social/rooms/${roomCode}/league/submit`, { answer, shareAnswer, idempotencyKey }, { signal: AbortSignal.timeout(12_000) });
      trackProductEvent('lab_game_completed', { game: 'league_daily', character: round?.character, roundDay: season?.day });
      await onReload();
    } catch (nextError) {
      setLocalError(nextError.message === '大模型响应超时' ? 'AI 还没判完，答案已保留在这台设备，可直接重试。' : nextError.message);
      setConfirming(false);
    } finally { setWorking(false); }
  };

  const vote = async (entry) => {
    setWorking(true); setLocalError('');
    try { await postJson(`/api/social/rooms/${roomCode}/league/vote`, { submissionId: entry.submissionId }); await onReload(); }
    catch (nextError) { setLocalError(nextError.message); }
    finally { setWorking(false); }
  };

  const report = async (entry) => {
    setWorking(true); setLocalError('');
    try { await postJson(`/api/social/rooms/${roomCode}/league/report`, { submissionId: entry.submissionId, reason: '不适合好友房' }); setLocalError('已收到举报，房主可以隐藏这条答案。'); }
    catch (nextError) { setLocalError(nextError.message); }
    finally { setWorking(false); }
  };

  const startNextSeason = async () => {
    setWorking(true); setLocalError('');
    try { await postJson(`/api/social/rooms/${roomCode}/league/next-season`, {}); await onReload(); }
    catch (nextError) { setLocalError(nextError.message); }
    finally { setWorking(false); }
  };

  const retryJudgement = async (submissionId = null) => {
    setWorking(true); setLocalError('');
    try { await postJson(`/api/social/rooms/${roomCode}/league/retry`, submissionId ? { submissionId } : {}); await onReload(); }
    catch (nextError) { setLocalError(nextError.message); }
    finally { setWorking(false); }
  };

  const moderate = async (entry) => {
    setWorking(true); setLocalError('');
    try { await postJson(`/api/social/rooms/${roomCode}/league/moderate`, { submissionId: entry.submissionId, hidden: true }); await onReload(); }
    catch (nextError) { setLocalError(nextError.message); }
    finally { setWorking(false); }
  };

  const removeMember = async (member) => {
    if (!window.confirm(`将 ${member.nickname} 移出这个联赛？`)) return;
    setWorking(true); setLocalError('');
    try { await postJson(`/api/social/rooms/${roomCode}/league/remove`, { memberId: member.memberId }); await onReload(); }
    catch (nextError) { setLocalError(nextError.message); }
    finally { setWorking(false); }
  };

  if (!data) return <main className="friends-page"><div className="game-loading">正在同步今天的联赛…</div></main>;
  return <main className="friends-page league-page">
    <header className="friends-room-head league-room-head"><div><button type="button" className="friends-back" onClick={onBack}><Icon name="arrow" size={16}/> 返回好友首页</button><small>房间码 {roomCode} · 第 {season?.number || 1} 季</small><h1>{room?.name || '七日抽象联赛'}</h1><p>{season?.status === 'finished' ? '本季已结算，查看嘉豪之神后可继续下一季。' : `第 ${currentDay} / 7 天 · 每天一句，明天锁榜。`}</p></div><button type="button" className="primary-button league-invite-button" onClick={onShare}>邀请好友 <Icon name="share"/></button></header>
    {error ? <p className="form-message error" role="alert">{error}</p> : null}{notice ? <p className="form-message info" role="status">{notice}</p> : null}<RecoveryNotice code={recoveryCode}/>
    {!data.isMember ? <section className="league-join-card"><span>30 秒入局</span><h2>{round?.prompt}</h2><p>先起个昵称，不用注册，也不用先做鉴定。</p><label htmlFor="league-nickname">联赛昵称<input id="league-nickname" maxLength={24} value={nickname} onChange={(event) => onNickname(event.target.value)}/></label><button type="button" className="yellow-button" disabled={busy || !nickname.trim()} onClick={onJoin}>加入联赛 <Icon name="arrow"/></button></section> : <>
      <nav className="league-progress" aria-label="七日赛季进度">
        {Array.from({ length: 7 }, (_, index) => {
          const day = index + 1;
          const state = season?.status === 'finished' || day < currentDay ? 'done' : day === currentDay ? 'active' : 'locked';
          return <span key={day} className={state} aria-current={state === 'active' ? 'step' : undefined}><b>{day}</b><small>{state === 'active' ? '今天' : state === 'done' ? '完成' : day === currentDay + 1 ? '明天' : `第 ${day} 天`}</small></span>;
        })}
      </nav>
      {data.pendingJudgement && data.pendingJudgement.roundDate !== round?.date ? <section className="league-pending-banner" role="status"><div><strong>{data.pendingJudgement.roundDate} 的答案还在等待 AI 重判</strong><span>原句已保留，补判成功后会重新计算当天积分。</span></div><button type="button" className="outline-button" disabled={working} onClick={() => retryJudgement(data.pendingJudgement.submissionId)}>补判上一局</button></section> : null}
      <div className="league-game-layout">
        <div className="league-game-main">
          <section className={`league-daily ${round?.character === 'nailoong' ? 'nailoong' : 'jiahao'}`}><header><span>{round?.character === 'nailoong' ? '奶龙今日题' : '嘉豪今日题'}</span><small>{round?.date}</small></header><h2>{round?.prompt || '今天已结算'}</h2>
        {season?.status === 'finished' ? <div className="league-season-finish"><strong>第 {season.number} 季已结束</strong><p>排名已锁定，原句将在 7 天后删除。</p><div className="league-awards">{(data.awards || []).map((award) => <span key={award.key}><small>{award.title}</small><b>{award.names?.join(' / ') || '待解锁'}</b></span>)}</div>{room?.isOwner ? <button type="button" className="yellow-button" disabled={working} onClick={startNextSeason}>原群开启下一季</button> : null}</div> : round?.judgementStatus && round.judgementStatus !== 'ready' ? <div className="league-season-finish"><strong>AI 等待重判</strong><p>原句已安全保留，暂不生成竞争分。</p><button type="button" className="yellow-button" disabled={working} onClick={retryJudgement}>{working ? '正在重判…' : '重试 AI 判定'}</button></div> : round?.hasSubmitted ? <div className="league-submitted"><strong>今天已交卷</strong><p>好友答案已解锁，你可以投出唯一一票。</p></div> : confirming ? <div className="league-confirm"><small>答案提交后不能修改</small><blockquote>{answer}</blockquote><div><button type="button" className="outline-button" onClick={() => setConfirming(false)}>再改改</button><button type="button" className="yellow-button" disabled={working} onClick={submit}>{working ? 'AI 正在判…' : '确认交卷'}</button></div></div> : <div className="league-answer-form"><label htmlFor="league-answer">今日答案<textarea id="league-answer" maxLength={120} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="一句话就够，越像你越好玩。"/></label><small>{answer.length} / 120</small><label className="consent-row"><input aria-label="同意联赛答案公开规则" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/><span>我同意这句话在本赛季内向房间成员展示，赛季结束 7 天后删除。</span></label><label className="league-share-answer"><input type="checkbox" checked={shareAnswer} onChange={(event) => setShareAnswer(event.target.checked)}/><span>允许我的分享卡带上原句</span></label><button type="button" className="yellow-button" disabled={working || answer.trim().length < 2} onClick={submit}>预览交卷 <Icon name="arrow"/></button></div>}
            {localError ? <p className={localError.startsWith('已收到') ? 'form-message info' : 'form-message error'} role="status">{localError}</p> : null}
          </section>
          {round?.hasSubmitted ? <section className="league-entry-section"><header><div><span>今日公开答案</span><h2>这局还能翻盘</h2></div><small>AI 分 + 好友票奖励</small></header><div className="league-entry-grid">{data.entries.map((entry) => <article key={entry.submissionId} className={entry.isSelf ? 'self' : ''}><div className="league-entry-rank"><b>#{entry.provisionalRank || '--'}</b><span>{entry.totalScore}<small>综合分</small></span></div><div><header><strong>{entry.nickname}{entry.isSelf ? '（我）' : ''}</strong><em>{entry.tag}</em></header><blockquote>{entry.answer || '原句已按规则删除'}</blockquote><p>{entry.verdict}</p></div><footer><span>{entry.voteCount} 票</span>{entry.isSelf ? <small>不能投自己</small> : <><button type="button" className={entry.isVoted ? 'voted' : ''} disabled={working} aria-label={entry.isVoted ? `已投${entry.nickname}` : `投${entry.nickname}一票`} onClick={() => vote(entry)}>{entry.isVoted ? '已投这句' : '投这句'}</button><button type="button" className="report-link" onClick={() => report(entry)}>举报</button>{room?.isOwner ? <button type="button" className="report-link" onClick={() => moderate(entry)}>隐藏</button> : null}</>}</footer></article>)}</div></section> : null}
        </div>
        <aside className="league-standings"><header><div><span>七日总榜</span><h2>本季战况</h2></div><small>{room?.memberCount} / {room?.memberLimit} 人</small></header>{data.standings.length ? data.standings.map((item) => <article key={item.memberId} className={item.isSelf ? 'self' : ''}><b>{String(item.rank).padStart(2, '0')}</b><span>{item.nickname}{item.isSelf ? '（我）' : ''}<small>已玩 {item.daysPlayed} 天</small></span><strong>{item.seasonPoints}<small>积分</small></strong>{room?.isOwner && !item.isSelf ? <button type="button" className="report-link" onClick={() => removeMember(item)}>移出</button> : null}</article>) : <p>今天的第一句还在等你。</p>}<footer><span>赛季进度</span><strong>{currentDay} / 7</strong><small>本季剩余 {Math.max(0, 7 - currentDay)} 天</small></footer></aside>
      </div>
      <p className="privacy-line league-privacy"><Icon name="lock" size={15}/> {data.privacy}</p>
    </>}</main>;
}

function LegacyRoom({ data, roomCode, latestResult, nickname, onNickname, busy, error, notice, onShare, onJoin, onAssess, onTask, onBack }) {
  const room = data?.room;
  const members = data?.members || [];
  const [scoreView, setScoreView] = useState('jiahao');
  const nailoongScores = members.map((member) => scoreOf(member, 'nailoong', null)).filter(Number.isFinite);
  const average = scoreView === 'jiahao' ? room?.averageScore : nailoongScores.length ? Math.round(nailoongScores.reduce((sum, score) => sum + score, 0) / nailoongScores.length) : '--';
  return <main className="friends-page"><header className="friends-room-head"><div><button type="button" className="friends-back" onClick={onBack}><Icon name="arrow" size={16}/> 返回好友首页</button><small>房间码 {roomCode}</small><h1>{room?.name || '好友整活房'}</h1><p>{data?.isMember ? '你已在房间里，排行会跟着最新成绩更新。' : '加入后才能看到自己的名次。'}</p></div><button type="button" className="primary-button" disabled={!room} onClick={onShare}>邀请好友 <Icon name="share"/></button></header>{error ? <p className="form-message error" role="alert">{error}</p> : null}{notice ? <p className="form-message info" role="status">{notice}</p> : null}{!data && !error ? <div className="game-loading">正在同步好友战绩…</div> : null}{data ? <><div className="score-view-tabs" role="tablist" aria-label="好友榜类型"><button type="button" role="tab" aria-selected={scoreView === 'jiahao'} onClick={() => setScoreView('jiahao')}>嘉豪榜</button><button type="button" role="tab" aria-selected={scoreView === 'nailoong'} onClick={() => setScoreView('nailoong')}>奶龙榜</button></div><section className="room-metrics"><div><span>{scoreView === 'jiahao' ? '平均嘉豪' : '平均奶龙'}</span><strong>{average}</strong></div><div><span>参与人数</span><strong>{room.memberCount}<small> / {room.memberLimit}</small></strong></div><div><span>我的名次</span><strong>{members.find((member) => member.isSelf)?.rank || '--'}</strong></div></section>{!data.isMember && !room.isExpired ? <section className="join-room-strip"><div><strong>加入后查看你的名次</strong><p>只公开昵称和成绩。</p></div><input aria-label="好友房昵称" maxLength={24} value={nickname} onChange={(event) => onNickname(event.target.value)}/><button type="button" className="yellow-button" disabled={busy} onClick={latestResult ? onJoin : onAssess}>{latestResult ? '带成绩加入' : '先去鉴定'}</button></section> : null}<section className="room-content"><div className="leaderboard"><header><strong>{scoreView === 'jiahao' ? '嘉豪榜' : '奶龙榜'}</strong><span>本周排行</span></header>{members.map((member) => <article key={member.memberId} className={member.isSelf ? 'self' : ''}><b>{String(member.rank).padStart(2, '0')}</b><span className="avatar">{member.nickname?.slice(0, 1) || '豪'}</span><div><strong>{member.nickname}{member.isSelf ? '（我）' : ''}</strong><small>{scoreView === 'jiahao' ? member.type : member.nailoong?.archetype}</small></div><span><b>{member.seasonPoints || 0}</b><small>积分</small></span><span><b>{scoreOf(member, scoreView)}</b><small>{scoreView === 'jiahao' ? '嘉豪' : '奶龙'}</small></span></article>)}</div><aside className="room-task"><small>今日任务</small><h2>{data.dailyTask?.title || '用一句话证明你嘴硬'}</h2><p>完成得 3 分，每天一次。</p><button type="button" className="primary-button" disabled={busy || !data.isMember || data.todayTaskCompleted} onClick={onTask}>{data.todayTaskCompleted ? '今天玩过了' : '完成任务'}</button></aside></section></> : null}</main>;
}

export function FriendsPage({ roomCode, latestResult, onNavigate, onRoomOpen }) {
  const [session, setSession] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem('jiahao-nickname') || '奶龙本人');
  const [roomName, setRoomName] = useState('我们的七日抽象联赛');
  const [joinCode, setJoinCode] = useState('');
  const [entryMode, setEntryMode] = useState('create');
  const [roomType, setRoomType] = useState('league');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const autoJoinRef = useRef(false);

  const loadSession = async () => { setError(''); try { setSession(await apiRequest('/api/social/session')); } catch (nextError) { setError(nextError.message); } };
  const loadRoom = async (code) => { setError(''); try { const payload = await apiRequest(`/api/social/rooms/${encodeURIComponent(code)}`); setRoomData(payload); trackProductEvent('challenge_opened', { roomType: payload.room?.roomType || 'friends' }); } catch (nextError) { setError(nextError.message); } };
  useEffect(() => { if (roomCode) void loadRoom(roomCode); else void loadSession(); }, [roomCode]);

  const createRoom = async (selectedType = roomType) => {
    if (selectedType !== 'league' && !latestResult) return onNavigate('assay');
    setBusy(true); setError('');
    try {
      localStorage.setItem('jiahao-nickname', nickname.trim() || '奶龙本人');
      const payload = await postJson('/api/social/rooms', { name: selectedType === 'challenge' ? '谁更抽象挑战' : roomName, nickname, roomType: selectedType, memberLimit: selectedType === 'league' ? 12 : 20, ...(selectedType === 'league' ? {} : makeSocialResultPayload(latestResult)) });
      if (payload.recoveryCode) setRecoveryCode(payload.recoveryCode);
      trackProductEvent(selectedType === 'league' ? 'league_room_created' : selectedType === 'challenge' ? 'challenge_created' : 'room_created', { roomType: selectedType });
      onRoomOpen(payload.code);
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); }
  };

  const joinRoom = async ({ auto = false } = {}) => {
    const league = roomData?.room?.roomType === 'league';
    if (!league && !latestResult) return;
    setBusy(true); setError('');
    try {
      localStorage.setItem('jiahao-nickname', nickname.trim() || '奶龙本人');
      const payload = await postJson(`/api/social/rooms/${roomCode}/join`, { nickname, ...(league ? {} : makeSocialResultPayload(latestResult)) });
      if (payload.recoveryCode) setRecoveryCode(payload.recoveryCode);
      trackProductEvent(league ? 'league_joined' : 'room_joined', { roomType: league ? 'league' : 'friends' });
      if (auto) sessionStorage.removeItem('jiahao-pending-room');
      await loadRoom(roomCode);
    } catch (nextError) { if (auto) autoJoinRef.current = false; setError(nextError.message); }
    finally { setBusy(false); }
  };

  const startInvitedAssessment = () => { sessionStorage.setItem('jiahao-pending-room', roomCode); onNavigate('assay'); };
  const startFriendAssessment = () => { sessionStorage.setItem('jiahao-pending-destination', 'friends'); onNavigate('assay'); };
  useEffect(() => { const pending = sessionStorage.getItem('jiahao-pending-room'); if (!roomCode || roomData?.room?.roomType === 'league' || pending !== roomCode || !latestResult || !roomData || roomData.isMember || busy || autoJoinRef.current) return; autoJoinRef.current = true; void joinRoom({ auto: true }); }, [roomCode, latestResult, roomData, busy]);

  const shareRoom = async () => {
    const url = `${window.location.origin}/r/${roomCode}`;
    try { if (navigator.share) await navigator.share({ title: roomData?.room?.name || '好友联赛', text: roomData?.round?.prompt || '每天一句，七天决出嘉豪之神。', url }); else { await navigator.clipboard.writeText(url); setNotice('邀请链接已复制，直接发到群里就能开玩。'); } trackProductEvent(roomData?.room?.roomType === 'league' ? 'league_invite_shared' : 'share_clicked', { mode: 'room_link', roomType: roomData?.room?.roomType || 'friends' }); }
    catch (nextError) { if (nextError?.name !== 'AbortError') setError('分享没有成功，请复制浏览器地址。'); }
  };

  const completeTask = async () => { setBusy(true); setError(''); try { await postJson(`/api/social/rooms/${roomCode}/task`, { taskId: roomData?.dailyTask?.id }); await loadRoom(roomCode); trackProductEvent('lab_game_completed', { game: 'room_task' }); } catch (nextError) { setError(nextError.message); } finally { setBusy(false); } };

  if (roomCode && roomData?.room?.roomType === 'league') return <LeagueRoom data={roomData} roomCode={roomCode} nickname={nickname} onNickname={setNickname} busy={busy} error={error} notice={notice} recoveryCode={recoveryCode} onJoin={joinRoom} onShare={shareRoom} onReload={() => loadRoom(roomCode)} onBack={() => onNavigate('friends')}/>;
  if (roomCode) return <LegacyRoom data={roomData} roomCode={roomCode} latestResult={latestResult} nickname={nickname} onNickname={setNickname} busy={busy} error={error} notice={notice} onShare={shareRoom} onJoin={joinRoom} onAssess={startInvitedAssessment} onTask={completeTask} onBack={() => onNavigate('friends')}/>;

  return <main className="friends-page friends-home league-home"><header className="friends-title"><div><span className="league-kicker">7 DAY FRIEND LEAGUE</span><h1>好友七日联赛</h1><p>每天同一道题，AI 先判，好友再投票。</p></div><div className="friends-score-status ready"><span>不用注册</span><strong>30 秒入局</strong></div></header>{error ? <p className="form-message error" role="alert">{error}</p> : null}<RecoveryNotice code={recoveryCode}/><section className="friends-entry-console"><div className="friends-entry-tabs" role="tablist" aria-label="选择好友玩法"><button type="button" role="tab" aria-selected={entryMode === 'create'} onClick={() => setEntryMode('create')}>发起联赛</button><button type="button" role="tab" aria-selected={entryMode === 'join'} onClick={() => setEntryMode('join')}>加入房间</button></div>{entryMode === 'create' ? <div className="friends-create-flow"><div className="friends-room-type" role="group" aria-label="选择好友局类型"><button type="button" aria-pressed={roomType === 'league'} onClick={() => setRoomType('league')}><Icon name="spark"/><span><b>7 日联赛</b><small>每天一句 + 好友投票</small></span></button><button type="button" aria-pressed={roomType === 'challenge'} onClick={() => setRoomType('challenge')}><Icon name="sword"/><span><b>单挑好友</b><small>保留原有战绩挑战</small></span></button></div>{roomType !== 'league' && !latestResult ? <div className="friends-prerequisite"><div><span>旧玩法需要一份成绩</span><h2>先测一次，再把结果带进好友局</h2><p>七日联赛不需要先鉴定。</p></div><button type="button" className="outline-button" onClick={startFriendAssessment}>先完成鉴定</button></div> : <div className="friends-create-fields"><label>你的昵称<input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)}/></label>{roomType === 'league' ? <label>联赛名<input value={roomName} maxLength={40} onChange={(event) => setRoomName(event.target.value)}/></label> : null}<button type="button" className="primary-button" disabled={busy || !nickname.trim()} onClick={() => createRoom(roomType)}>{busy ? '正在创建…' : roomType === 'league' ? '创建 7 日好友联赛' : '生成挑战链接'} <Icon name="arrow"/></button></div>}</div> : <div className="friends-join-flow"><div><span>已有邀请</span><h2>输入房间码</h2><p>联赛不需要先鉴定，进房就能答今日题。</p></div><label htmlFor="friends-room-code">输入好友房间码<input id="friends-room-code" value={joinCode} maxLength={10} autoCapitalize="characters" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="例如 H7K9P2Q"/></label><button type="button" className="yellow-button" disabled={!joinCode.trim()} onClick={() => onRoomOpen(joinCode.trim().toUpperCase())}>进入好友房 <Icon name="arrow"/></button></div>}</section><section className="room-history"><header><h2>我的好友房</h2><span>{session?.rooms?.length || 0} 个</span></header>{session?.rooms?.length ? session.rooms.map((room) => <button type="button" key={room.code} onClick={() => onRoomOpen(room.code)}><span><strong>{room.name}</strong><small>{room.is_owner ? '我创建的' : '已加入'} · {room.member_count} 人 · {room.room_type === 'league' ? '7 日联赛' : '经典房'}</small></span><b>{room.room_type === 'league' ? '今日' : room.score}<small>{room.room_type === 'league' ? '待开局' : '嘉豪'}</small></b><Icon name="arrow"/></button>) : <p>还没有房间记录。创建联赛，叫朋友来答同一道题。</p>}</section></main>;
}
