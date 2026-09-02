import { useEffect, useMemo, useState } from 'react';
import { Icon } from './components/Icon';
import { useAssessmentHistory } from './app/useAssessmentHistory';
import { AssayPage } from './features/assay/AssayPage';
import { ResultPage } from './features/result/ResultPage';
import { LabPage } from './features/lab/LabPage';
import { FriendsPage } from './features/friends/FriendsPage';
import { ArchivePage } from './features/archive/ArchivePage';
import './editorial.css';

const NAV_ITEMS = [
  { id: 'assay', label: '鉴定', icon: 'stamp' },
  { id: 'lab', label: '抽象实验室', mobileLabel: '实验室', icon: 'flask' },
  { id: 'friends', label: '好友战绩', mobileLabel: '好友', icon: 'users' },
];

function routeRoomCode() {
  return window.location.pathname.match(/^\/r\/([A-Z2-9]{6,10})\/?$/i)?.[1]?.toUpperCase() || '';
}

function Header({ page, onNavigate }) {
  return <header className="editorial-header"><button type="button" className="editorial-brand" onClick={() => onNavigate('assay')} aria-label="返回鉴定首页"><span>嘉豪</span>鉴定所<i/></button><nav aria-label="主导航">{NAV_ITEMS.map((item) => <button type="button" key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}>{item.label}</button>)}</nav><button type="button" className="archive-button" onClick={() => onNavigate('archive')}><Icon name="archive" size={18}/> 我的档案 <Icon name="arrow" size={18}/></button></header>;
}

function MobileNav({ page, onNavigate }) {
  return <nav className="mobile-nav" aria-label="移动端主导航">{NAV_ITEMS.map((item) => <button type="button" key={item.id} className={page === item.id ? 'active' : ''} aria-current={page === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}><Icon name={item.icon}/><span>{item.mobileLabel || item.label}</span></button>)}<button type="button" className={page === 'archive' ? 'active' : ''} aria-current={page === 'archive' ? 'page' : undefined} onClick={() => onNavigate('archive')}><Icon name="archive"/><span>我的</span></button></nav>;
}

export default function App() {
  const initialRoomCode = routeRoomCode();
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [page, setPage] = useState(() => initialRoomCode ? 'friends' : 'assay');
  const [result, setResult] = useState(null);
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

  const navigate = (nextPage) => {
    if (window.location.pathname !== '/') window.history.pushState({}, '', '/');
    setRoomCode('');
    setPage(nextPage);
    if (nextPage !== 'assay') setResult(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    {page === 'lab' ? <LabPage latestResult={latestResult} onNavigate={navigate} onReactionComplete={applyReaction}/> : null}
    {page === 'friends' ? <FriendsPage roomCode={roomCode} latestResult={latestResult} onNavigate={navigate} onRoomOpen={openRoom}/> : null}
    {page === 'archive' ? <ArchivePage history={history} onSelectHistory={(item) => { setResult(item); setPage('assay'); window.scrollTo({ top: 0 }); }} onClear={clear}/> : null}
    <footer className="editorial-footer"><strong>嘉豪鉴定所</strong><span>双指数娱乐实验 · 不保存原始内容</span><span>结果不构成事实判断，别太当真。</span></footer>
    <MobileNav page={page} onNavigate={navigate}/>
  </div>;
}
