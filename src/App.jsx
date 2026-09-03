import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Icon } from './components/Icon';
import { postJson } from './app/api';
import { IMAGE_GENERATION_REQUEST_TIMEOUT_MS, createImageGenerationTask } from './app/imageGenerationTask';
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

function ImageGenerationDock({ job, onOpen, onDismiss }) {
  if (job.status === 'idle') return null;
  const running = job.status === 'running';
  const complete = job.status === 'complete';
  return <aside className={`image-job-dock ${job.status}`} aria-live="polite">
    <span className="image-job-mark"><Icon name={running ? 'spark' : complete ? 'image' : 'close'} size={20}/></span>
    <div><strong>{running ? '奶蛙正在画' : complete ? '抽象现场已送达' : '这张图没画出来'}</strong><small>{running ? '放心去玩别的，画好会叫你。' : complete ? '随时回来查看或下载。' : '回到生图局，换个说法再试。'}</small></div>
    <button type="button" onClick={onOpen}>{running ? '查看进度' : complete ? '看图' : '去重试'}</button>
    {!running ? <button type="button" className="image-job-dismiss" aria-label="关闭图片生成提醒" onClick={onDismiss}><Icon name="close" size={17}/></button> : null}
    {running ? <i aria-hidden="true"><b/></i> : null}
  </aside>;
}

export default function App() {
  const initialRoomCode = routeRoomCode();
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [page, setPage] = useState(() => initialRoomCode ? 'friends' : 'hao');
  const [result, setResult] = useState(null);
  const imageTask = useMemo(() => createImageGenerationTask((input) => postJson('/api/images/generate', input, { signal: AbortSignal.timeout(IMAGE_GENERATION_REQUEST_TIMEOUT_MS) })), []);
  const imageJob = useSyncExternalStore(imageTask.subscribe, imageTask.getSnapshot, imageTask.getSnapshot);
  const { history, add, clear } = useAssessmentHistory();
  const latestResult = useMemo(() => result || history.find((item) => item && item.kind !== 'pk') || null, [result, history]);

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
    const nextUrl = target === 'image' ? '/#nailoong-image-studio' : '/';
    if (`${window.location.pathname}${window.location.hash}` !== nextUrl) window.history.pushState({}, '', nextUrl);
    setRoomCode('');
    setPage(nextPage);
    if (nextPage !== 'assay') setResult(null);
    if (target === 'image') window.setTimeout(() => document.getElementById('nailoong-image-studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openImageStudio = () => {
    navigate('lab', 'image');
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
    {page === 'lab' ? <LabPage latestResult={latestResult} onNavigate={navigate} onReactionComplete={applyReaction} imageTask={imageTask} imageJob={imageJob}/> : null}
    {page === 'hao' ? <HaoPage onNavigate={navigate}/> : null}
    {page === 'friends' ? <FriendsPage roomCode={roomCode} latestResult={latestResult} onNavigate={navigate} onRoomOpen={openRoom}/> : null}
    {page === 'archive' ? <ArchivePage history={history} onSelectHistory={(item) => { setResult(item); setPage('assay'); window.scrollTo({ top: 0 }); }} onClear={clear}/> : null}
    <footer className="editorial-footer"><strong>豪气宇宙</strong><span>原始内容不保存，结果仅供娱乐。</span></footer>
    <ImageGenerationDock job={imageJob} onOpen={openImageStudio} onDismiss={imageTask.dismiss}/>
    <MobileNav page={page} onNavigate={navigate}/>
  </div>;
}
