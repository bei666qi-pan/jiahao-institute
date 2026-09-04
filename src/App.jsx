import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Icon } from './components/Icon';
import { AiProgress } from './components/AiProgress';
import { apiRequest, postJson } from './app/api';
import { createMediaGenerationTask } from './app/mediaGenerationTask';
import { useAssessmentHistory } from './app/useAssessmentHistory';
import { AssayPage } from './features/assay/AssayPage';
import { ResultPage } from './features/result/ResultPage';
import { LabPage } from './features/lab/LabPage';
import { FriendsPage } from './features/friends/FriendsPage';
import { ArchivePage } from './features/archive/ArchivePage';
import { HaoPage } from './features/hao/HaoPage';
import './editorial.css';
import './hao-universe.css';

const NAV_ITEMS = [
  { id: 'hao', label: '豪气宇宙', mobileLabel: '豪气', icon: 'spark' },
  { id: 'assay', label: '嘉豪鉴定', mobileLabel: '鉴定', icon: 'stamp' },
  { id: 'lab', label: '抽象实验室', mobileLabel: '实验室', icon: 'flask' },
  { id: 'friends', label: '好友豪气榜', mobileLabel: '好友', icon: 'users' },
];

function routeRoomCode() {
  return window.location.pathname.match(/^\/r\/([A-Z2-9]{6,10})\/?$/i)?.[1]?.toUpperCase() || '';
}

function Header({ page, onNavigate }) {
  return <header className="editorial-header"><button type="button" className="editorial-brand" onClick={() => onNavigate('hao')} aria-label="返回豪气宇宙"><span>豪气</span>宇宙</button><nav aria-label="主导航">{NAV_ITEMS.map((item) => <button type="button" key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>{item.label}</button>)}</nav><button type="button" className={`archive-button ${page === 'archive' ? 'active' : ''}`} aria-current={page === 'archive' ? 'page' : undefined} onClick={() => onNavigate('archive')}><Icon name="archive" size={18}/> 人格档案</button></header>;
}

function MobileNav({ page, onNavigate }) {
  return <nav className="mobile-nav" aria-label="移动端主导航">{NAV_ITEMS.map((item) => <button type="button" key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}><Icon name={item.icon}/><span>{item.mobileLabel || item.label}</span></button>)}<button type="button" className={page === 'archive' ? 'active' : ''} aria-current={page === 'archive' ? 'page' : undefined} onClick={() => onNavigate('archive')}><Icon name="archive"/><span>我的</span></button></nav>;
}

function MediaGenerationDock({ job, onOpen, onDismiss }) {
  if (job.status === 'idle') return null;
  const running = ['submitting', 'queued', 'running', 'finalizing'].includes(job.status);
  const complete = job.status === 'succeeded';
  const role = job.character === 'jiahao' ? '嘉豪' : '奶龙';
  const medium = job.mediaType === 'video' ? '视频' : '图片';
  const phase = job.status === 'submitting' ? '正在提交' : job.status === 'queued' ? '已进入队列' : job.status === 'finalizing' ? '正在收尾' : '正在生成';
  return <aside className={`image-job-dock ${job.status}`} aria-live="polite">
    <span className="image-job-mark"><Icon name={running ? 'spark' : complete ? (job.mediaType === 'video' ? 'play' : 'image') : 'close'} size={20}/></span>
    <div><strong>{running ? `${role}${medium}${phase}` : complete ? `${role}${medium}已送达` : job.status === 'exhausted' ? '今日视频额度已用' : `${role}${medium}未生成`}</strong><small>{running ? '可以继续浏览，完成后会提醒你。' : complete ? '随时回来播放或下载。' : '回到角色创作室查看详情。'}</small></div>
    <button type="button" onClick={onOpen}>{running ? '查看阶段' : complete ? '查看作品' : '回创作室'}</button>
    {!running ? <button type="button" className="image-job-dismiss" aria-label="关闭创作任务提醒" onClick={onDismiss}><Icon name="close" size={17}/></button> : null}
    {running ? <AiProgress label="全局任务" kind={job.mediaType} status={job.status} startedAt={job.startedAt} compact/> : null}
  </aside>;
}

export default function App() {
  const initialRoomCode = routeRoomCode();
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [page, setPage] = useState(() => initialRoomCode ? 'friends' : 'hao');
  const [result, setResult] = useState(null);
  const mediaTask = useMemo(() => createMediaGenerationTask({
    generateImage: (input) => postJson('/api/images/generate', input, { signal: AbortSignal.timeout(360_000) }),
    createVideo: (input) => postJson('/api/videos/tasks', input),
    getVideoTask: (id) => apiRequest(`/api/videos/tasks/${encodeURIComponent(id)}`),
  }), []);
  const mediaJob = useSyncExternalStore(mediaTask.subscribe, mediaTask.getSnapshot, mediaTask.getSnapshot);
  const { history, add, clear } = useAssessmentHistory();
  const latestResult = useMemo(() => result || history.find((item) => item && item.kind !== 'pk') || null, [result, history]);

  useEffect(() => {
    void mediaTask.restore();
    return () => mediaTask.destroy();
  }, [mediaTask]);

  useEffect(() => {
    const onPopState = () => {
      const code = routeRoomCode();
      setRoomCode(code);
      if (code) setPage('friends');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (nextPage, target = '') => {
    const nextUrl = target === 'studio' ? '/#character-studio' : '/';
    if (`${window.location.pathname}${window.location.hash}` !== nextUrl) window.history.pushState({}, '', nextUrl);
    setRoomCode('');
    setPage(nextPage);
    if (nextPage !== 'assay') setResult(null);
    if (target === 'studio') window.setTimeout(() => document.getElementById('character-studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openMediaStudio = () => {
    navigate('lab', 'studio');
  };

  const openRoom = (code) => {
    const normalized = String(code || '').toUpperCase();
    window.history.pushState({}, '', `/r/${normalized}`);
    setRoomCode(normalized);
    setPage('friends');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const completeAssessment = (nextResult) => {
    setResult(nextResult);
    add(nextResult);
    const pendingRoom = sessionStorage.getItem('jiahao-pending-room');
    if (pendingRoom) {
      openRoom(pendingRoom);
      return;
    }
    if (sessionStorage.getItem('jiahao-pending-destination') === 'friends') {
      sessionStorage.removeItem('jiahao-pending-destination');
      navigate('friends');
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const applyReaction = (reaction) => {
    if (!latestResult) return;
    add({ ...latestResult, nailoong: reaction.nailoong, createdAt: Date.now(), reactionChallengeId: reaction.challengeId });
  };

  return <div className="editorial-shell">
    <Header page={page} onNavigate={navigate}/>
    {page === 'assay' && result ? <ResultPage result={result} onReset={() => setResult(null)} onNavigate={navigate} onRoomOpen={openRoom}/> : null}
    {page === 'assay' && !result ? <AssayPage onComplete={completeAssessment} onNavigate={navigate}/> : null}
    {page === 'lab' ? <LabPage latestResult={latestResult} onNavigate={navigate} onReactionComplete={applyReaction} mediaTask={mediaTask} mediaJob={mediaJob}/> : null}
    {page === 'hao' ? <HaoPage onNavigate={navigate} onRoomOpen={openRoom}/> : null}
    {page === 'friends' ? <FriendsPage roomCode={roomCode} latestResult={latestResult} onNavigate={navigate} onRoomOpen={openRoom}/> : null}
    {page === 'archive' ? <ArchivePage history={history} onSelectHistory={(item) => { setResult(item); setPage('assay'); window.scrollTo({ top: 0 }); }} onClear={clear}/> : null}
    <footer className="editorial-footer"><strong>豪气宇宙</strong><span>原始内容不保存，结果仅供娱乐。</span></footer>
    <MediaGenerationDock job={mediaJob} onOpen={openMediaStudio} onDismiss={mediaTask.dismiss}/>
    <MobileNav page={page} onNavigate={navigate}/>
  </div>;
}
