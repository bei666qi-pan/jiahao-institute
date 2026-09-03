import { useEffect, useRef, useState } from 'react';
import { apiRequest, postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { makeSocialResultPayload } from '../../validation';
import { trackProductEvent } from '../../telemetry';

function scoreOf(member, field, fallback = '--') {
  const value = field === 'jiahao' ? member.score : member.nailoong?.score ?? member.nailoongScore;
  if (value === null || value === undefined || value === '') return fallback;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function FriendsPage({ roomCode, latestResult, onNavigate, onRoomOpen }) {
  const [session, setSession] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem('jiahao-nickname') || '奶龙本人');
  const [roomName, setRoomName] = useState('好友抽象战绩房');
  const [joinCode, setJoinCode] = useState('');
  const [entryMode, setEntryMode] = useState('create');
  const [roomType, setRoomType] = useState('challenge');
  const [scoreView, setScoreView] = useState('jiahao');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const autoJoinRef = useRef(false);

  const loadSession = async () => {
    setError('');
    try { setSession(await apiRequest('/api/social/session')); }
    catch (nextError) { setError(nextError.message); }
  };
  const loadRoom = async (code) => {
    setError('');
    try {
      const payload = await apiRequest(`/api/social/rooms/${encodeURIComponent(code)}`);
      setRoomData(payload);
      trackProductEvent('challenge_opened', { roomCode: code });
    } catch (nextError) { setError(nextError.message); }
  };

  useEffect(() => {
    if (roomCode) void loadRoom(roomCode);
    else void loadSession();
  }, [roomCode]);

  const createRoom = async (roomType = 'friends') => {
    if (!latestResult) return onNavigate('assay');
    setBusy(true);
    setError('');
    try {
      localStorage.setItem('jiahao-nickname', nickname.trim() || '奶龙本人');
      const payload = await postJson('/api/social/rooms', {
        name: roomType === 'challenge' ? '谁更抽象挑战' : roomName,
        nickname,
        roomType,
        memberLimit: 20,
        ...makeSocialResultPayload(latestResult),
      });
      trackProductEvent(roomType === 'challenge' ? 'challenge_created' : 'room_created', { roomType });
      onRoomOpen(payload.code);
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); }
  };

  const joinRoom = async ({ auto = false } = {}) => {
    if (!latestResult) return;
    setBusy(true);
    setError('');
    try {
      await postJson(`/api/social/rooms/${roomCode}/join`, { nickname, ...makeSocialResultPayload(latestResult) });
      trackProductEvent('room_joined', { roomCode });
      if (auto) sessionStorage.removeItem('jiahao-pending-room');
      await loadRoom(roomCode);
    } catch (nextError) {
      if (auto) autoJoinRef.current = false;
      setError(nextError.message);
    }
    finally { setBusy(false); }
  };

  const startInvitedAssessment = () => {
    sessionStorage.setItem('jiahao-pending-room', roomCode);
    onNavigate('assay');
  };

  const startFriendAssessment = () => {
    sessionStorage.setItem('jiahao-pending-destination', 'friends');
    onNavigate('assay');
  };

  useEffect(() => {
    const pendingRoom = sessionStorage.getItem('jiahao-pending-room');
    if (!roomCode || pendingRoom !== roomCode || !latestResult || !roomData || roomData.isMember || busy || autoJoinRef.current) return;
    autoJoinRef.current = true;
    void joinRoom({ auto: true });
  }, [roomCode, latestResult, roomData, busy]);

  const shareRoom = async () => {
    const url = `${window.location.origin}/r/${roomCode}`;
    try {
      if (navigator.share) await navigator.share({ title: roomData?.room?.name || '好友整活房', text: '来看看我们谁更抽象。', url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice('邀请链接已复制，可以直接发给好友。');
      }
      trackProductEvent('share_clicked', { mode: 'room_link', roomType: roomData?.room?.roomType || 'friends' });
    } catch (nextError) {
      if (nextError?.name !== 'AbortError') setError('分享没有成功，请复制浏览器地址后发给好友。');
    }
  };

  const enterRoom = () => {
    const code = joinCode.trim().toUpperCase();
    if (code) onRoomOpen(code);
  };

  const completeTask = async () => {
    setBusy(true);
    setError('');
    try {
      await postJson(`/api/social/rooms/${roomCode}/task`, { taskId: roomData?.dailyTask?.id });
      await loadRoom(roomCode);
      trackProductEvent('lab_game_completed', { game: 'room_task' });
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); }
  };

  if (roomCode) {
    const room = roomData?.room;
    const members = roomData?.members || [];
    const nailoongScores = members.map((member) => scoreOf(member, 'nailoong', null)).filter(Number.isFinite);
    const displayedAverage = scoreView === 'jiahao' ? room?.averageScore : nailoongScores.length ? Math.round(nailoongScores.reduce((sum, score) => sum + score, 0) / nailoongScores.length) : '--';
    return <main className="friends-page">
      <header className="friends-room-head"><div><button type="button" className="friends-back" onClick={() => onNavigate('friends')}><Icon name="arrow" size={16}/> 返回好友首页</button><small>房间码 {roomCode}</small><h1>{room?.name || '好友整活房'}</h1><p>{roomData?.isMember ? '你已在房间里，排行会跟着最新成绩更新。' : '加入后才能看到自己的名次。'}</p></div><button type="button" className="primary-button" disabled={!room} onClick={shareRoom}>邀请好友 <Icon name="share"/></button></header>
      {error ? <p className="form-message error" role="alert">{error}</p> : null}
      {notice ? <p className="form-message info" role="status">{notice}</p> : null}
      {!roomData && !error ? <div className="game-loading">正在同步好友战绩…</div> : null}
      {roomData ? <>
        <div className="score-view-tabs" role="tablist" aria-label="好友榜类型"><button type="button" role="tab" aria-selected={scoreView === 'jiahao'} onClick={() => setScoreView('jiahao')}>嘉豪榜</button><button type="button" role="tab" aria-selected={scoreView === 'nailoong'} onClick={() => setScoreView('nailoong')}>奶龙榜</button></div>
        <section className="room-metrics"><div><span>{scoreView === 'jiahao' ? '平均嘉豪' : '平均奶龙'}</span><strong>{displayedAverage}</strong></div><div><span>参与人数</span><strong>{room.memberCount}<small> / {room.memberLimit}</small></strong></div><div><span>我的名次</span><strong>{members.find((member) => member.isSelf)?.rank || '--'}</strong></div></section>
        {!roomData.isMember && !room.isExpired ? <section className="join-room-strip"><div><strong>加入后查看你的名次</strong><p>只公开昵称和成绩。</p></div><input aria-label="好友房昵称" maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} /><button type="button" className="yellow-button" disabled={busy} onClick={latestResult ? () => joinRoom() : startInvitedAssessment}>{latestResult ? '带成绩加入' : '先去鉴定'}</button></section> : null}
        <section className="room-content"><div className="leaderboard"><header><strong>{scoreView === 'jiahao' ? '嘉豪榜' : '奶龙榜'}</strong><span>本周排行</span></header>{members.map((member) => <article key={member.memberId} className={member.isSelf ? 'self' : ''}><b>{String(member.rank).padStart(2, '0')}</b><span className="avatar">{member.nickname?.slice(0, 1) || '豪'}</span><div><strong>{member.nickname}{member.isSelf ? '（我）' : ''}</strong><small>{scoreView === 'jiahao' ? member.type : member.nailoong?.archetype}</small></div><span><b>{member.seasonPoints || 0}</b><small>积分</small></span><span><b>{scoreOf(member, scoreView)}</b><small>{scoreView === 'jiahao' ? '嘉豪' : '奶龙'}</small></span></article>)}</div><aside className="room-task"><small>今日任务</small><h2>{roomData.dailyTask?.title || '用一句话证明你嘴硬'}</h2><p>完成得 3 分，每天一次。</p><button type="button" className="primary-button" disabled={busy || !roomData.isMember || roomData.todayTaskCompleted} onClick={completeTask}>{roomData.todayTaskCompleted ? '今天玩过了' : '完成任务'}</button><p className="privacy-line"><Icon name="lock" size={15}/> 原始素材不会公开。</p></aside></section>
      </> : null}
    </main>;
  }

  return <main className="friends-page friends-home">
    <header className="friends-title"><div><h1>好友豪气榜</h1><p>发起一局，或输入房间码直接加入。</p></div><div className={`friends-score-status ${latestResult ? 'ready' : ''}`}><span>{latestResult ? '成绩已就绪' : '还差一步'}</span><strong>{latestResult ? `${latestResult.score} 嘉豪` : '先完成鉴定'}</strong></div></header>
    {error ? <p className="form-message error" role="alert">{error}</p> : null}
    <section className="friends-entry-console">
      <div className="friends-entry-tabs" role="tablist" aria-label="选择好友玩法"><button type="button" role="tab" aria-selected={entryMode === 'create'} onClick={() => { setEntryMode('create'); setError(''); }}>发起一局</button><button type="button" role="tab" aria-selected={entryMode === 'join'} onClick={() => { setEntryMode('join'); setError(''); }}>加入房间</button></div>
      {entryMode === 'create' ? <div className="friends-create-flow">
        {!latestResult ? <div className="friends-prerequisite"><div><span>创建前需要一份成绩</span><h2>先测一次，再把结果带进好友局</h2><p>完成鉴定后会自动回到这里，原始内容不会公开。</p></div><button type="button" className="primary-button" onClick={startFriendAssessment}>先完成鉴定 <Icon name="arrow"/></button></div> : <>
          <div className="friends-room-type" role="group" aria-label="选择好友局类型"><button type="button" aria-pressed={roomType === 'challenge'} onClick={() => setRoomType('challenge')}><Icon name="spark"/><span><b>单挑好友</b><small>一条链接，直接比成绩</small></span></button><button type="button" aria-pressed={roomType === 'friends'} onClick={() => setRoomType('friends')}><Icon name="users"/><span><b>整活房</b><small>多人排行，每日有任务</small></span></button></div>
          <div className="friends-create-fields"><label>你的昵称<input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} /></label>{roomType === 'friends' ? <label>房间名<input value={roomName} maxLength={40} onChange={(event) => setRoomName(event.target.value)} /></label> : <div className="friends-create-summary"><span>将创建</span><strong>谁更抽象挑战</strong><small>生成后可直接复制邀请链接</small></div>}<button type="button" className="primary-button" disabled={busy || !nickname.trim()} onClick={() => createRoom(roomType)}>{busy ? '正在创建…' : roomType === 'challenge' ? '生成挑战链接' : '创建整活房'} <Icon name="arrow"/></button></div>
        </>}
      </div> : <div className="friends-join-flow"><div><span>已有邀请</span><h2>输入房间码</h2><p>还没鉴定也能先进房，系统会引导你完成成绩。</p></div><label htmlFor="friends-room-code">输入好友房间码<input id="friends-room-code" value={joinCode} maxLength={10} autoCapitalize="characters" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="例如 JH8F32A" /></label><button type="button" className="yellow-button" disabled={!joinCode.trim()} onClick={enterRoom}>进入好友房 <Icon name="arrow"/></button></div>}
    </section>
    <section className="room-history"><header><h2>我的好友房</h2><span>{session?.rooms?.length || 0} 个</span></header>{session?.rooms?.length ? session.rooms.map((room) => <button type="button" key={room.code} onClick={() => onRoomOpen(room.code)}><span><strong>{room.name}</strong><small>{room.is_owner ? '我创建的' : '已加入'} · {room.member_count} 人</small></span><b>{room.score}<small>嘉豪</small></b><Icon name="arrow"/></button>) : <p>还没有房间记录。完成一次鉴定后，叫朋友来玩。</p>}</section>
  </main>;
}
