import { useEffect, useRef, useState } from 'react';
import { apiRequest, postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { makeSocialResultPayload } from '../../validation';
import { trackProductEvent } from '../../telemetry';

function scoreOf(member, field, fallback = '--') {
  const value = field === 'jiahao' ? member.score : member.nailoong?.score ?? member.nailoongScore;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function FriendsPage({ roomCode, latestResult, onNavigate, onRoomOpen }) {
  const [session, setSession] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem('jiahao-nickname') || '奶龙本人');
  const [roomName, setRoomName] = useState('好友抽象战绩房');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
        setError('邀请链接已复制。');
      }
      trackProductEvent('share_clicked', { mode: 'room_link', roomType: roomData?.room?.roomType || 'friends' });
    } catch (nextError) {
      if (nextError?.name !== 'AbortError') setError('分享没有成功，请复制浏览器地址后发给好友。');
    }
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
    return <main className="friends-page">
      <header className="friends-room-head"><div><small>ROOM / {roomCode}</small><h1>{room?.name || '好友整活房'}</h1><p>云端可信成绩优先，积分相同时再比双指数。</p></div><button type="button" className="primary-button" disabled={!room} onClick={shareRoom}>邀请好友加入 <Icon name="share"/></button></header>
      {error ? <p className="form-message error" role="alert">{error}</p> : null}
      {!roomData && !error ? <div className="game-loading">正在同步好友战绩…</div> : null}
      {roomData ? <>
        <section className="room-metrics"><div><span>平均嘉豪</span><strong>{room.averageScore}</strong></div><div><span>参与人数</span><strong>{room.memberCount}<small> / {room.memberLimit}</small></strong></div><div><span>我的名次</span><strong>{members.find((member) => member.isSelf)?.rank || '--'}</strong></div></section>
        {!roomData.isMember && !room.isExpired ? <section className="join-room-strip"><div><strong>加入后查看你的名次</strong><p>只公开昵称、双指数和人格，不公开原始素材。</p></div><input aria-label="好友房昵称" maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} /><button type="button" className="yellow-button" disabled={busy} onClick={latestResult ? () => joinRoom() : startInvitedAssessment}>{latestResult ? '使用当前成绩加入' : '先完成鉴定'}</button></section> : null}
        <section className="room-content"><div className="leaderboard"><header><strong>好友战绩</strong><span>赛季积分榜</span></header>{members.map((member) => <article key={member.memberId} className={member.isSelf ? 'self' : ''}><b>{String(member.rank).padStart(2, '0')}</b><span className="avatar">{member.nickname?.slice(0, 1) || '豪'}</span><div><strong>{member.nickname}{member.isSelf ? ' · 我' : ''}</strong><small>{member.nailoong?.archetype || member.type} · {member.verified ? '云端可信' : '基础成绩'}</small></div><span><b>{member.seasonPoints || 0}</b><small>积分</small></span><span><b>{scoreOf(member, 'jiahao')}</b><small>嘉豪</small></span><span><b>{scoreOf(member, 'nailoong')}</b><small>奶龙</small></span></article>)}</div><aside className="room-task"><small>今日轮换任务</small><h2>{roomData.dailyTask?.title || '用一句话证明你嘴硬'}</h2><p>完成一次得 3 分，每日只计一次。</p><button type="button" className="primary-button" disabled={busy || !roomData.isMember || roomData.todayTaskCompleted} onClick={completeTask}>{roomData.todayTaskCompleted ? '今日已完成' : '完成本期任务'}</button><ul><li>房间默认有效 7 天</li><li>原始素材不会公开</li><li>链接持有者可查看榜单</li></ul></aside></section>
      </> : null}
    </main>;
  }

  return <main className="friends-page">
    <header className="friends-title"><h1>好友战绩</h1><p>测完别急着走，把朋友拉进来比一比。</p></header>
    {error ? <p className="form-message error" role="alert">{error}</p> : null}
    <section className="friends-create-grid"><div><span>01</span><h2>发起好友挑战</h2><p>好友打开链接完成鉴定，自动生成双指数对比。</p><label>你的公开昵称<input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} /></label><button type="button" className="yellow-button" disabled={busy || !latestResult} onClick={() => createRoom('challenge')}>{latestResult ? '一键生成挑战链接' : '先完成一次鉴定'} <Icon name="arrow"/></button></div><div><span>02</span><h2>创建7天整活房</h2><p>每日轮换任务，按积分和双指数排名。</p><label>房间名称<input value={roomName} maxLength={40} onChange={(event) => setRoomName(event.target.value)} /></label><button type="button" className="primary-button" disabled={busy || !latestResult} onClick={() => createRoom('friends')}>创建好友整活房 <Icon name="users"/></button></div><div><span>03</span><h2>加入现有房间</h2><p>输入好友发来的房间码。</p><label>房间码<input value={joinCode} maxLength={10} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="例如 JH8F32A" /></label><button type="button" className="outline-button" disabled={!joinCode.trim()} onClick={() => onRoomOpen(joinCode.trim())}>打开排行榜 <Icon name="arrow"/></button></div></section>
    <section className="room-history"><header><h2>我的好友房</h2><span>{session?.rooms?.length || 0} 个</span></header>{session?.rooms?.length ? session.rooms.map((room) => <button type="button" key={room.code} onClick={() => onRoomOpen(room.code)}><span><strong>{room.name}</strong><small>{room.is_owner ? '我创建的' : '已加入'} · {room.member_count} 人</small></span><b>{room.score}<small>嘉豪</small></b><Icon name="arrow"/></button>) : <p>还没有房间记录。完成一次鉴定后，叫朋友来玩。</p>}</section>
  </main>;
}
