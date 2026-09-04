import { useEffect, useMemo, useState } from 'react';
import { apiRequest, postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { JiahaoPortrait } from '../../components/JiahaoPortrait';

const JIAHAO_TYPES = [
  ['计算机嘉豪', '终端常驻，张口就是底层原理。', 0],
  ['股票嘉豪', '涨了早就说了，跌了长期价值。', 1],
  ['不懂装懂豪', '术语密度拉满，细问就是底层逻辑。', 2],
  ['潜伏嘉豪', '口罩一戴，没人知道豪气已经上线。', 3],
  ['美式嘉豪', '走两步就像在拍自己的音乐短片。', 4],
  ['深情破碎豪', '嘴上说无所谓，耳机已经循环八遍。', 5],
];

const NAILOONG_TYPES = [
  ['淡人型奶龙豪', '表面说都行，心里已经把一切看淡。', 'arms'],
  ['嘴硬型奶龙豪', '表面说没事，心里准备了三套解释。', 'toes'],
  ['先点外卖型奶龙豪', '世界可以迟到，但外卖最好准时。', 'snack'],
  ['抽象反应型奶龙豪', '正常答案路过了，你从旁边绕行。', 'elevator'],
  ['镜头待机型奶龙豪', '嘴上说别拍，站位从来没有输过。', 'video-call'],
  ['好友迫害型奶龙豪', '朋友的黑历史，在你这里都有高清备份。', 'cat'],
];

export function ArchivePage({ history, onSelectHistory, onClear }) {
  const [tab, setTab] = useState('jiahao');
  const [session, setSession] = useState(null);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [identityNotice, setIdentityNotice] = useState('');
  const items = tab === 'jiahao' ? JIAHAO_TYPES : NAILOONG_TYPES;
  useEffect(() => { apiRequest('/api/social/session').then(setSession).catch(() => {}); }, []);
  const unlocked = useMemo(() => new Set([
    ...history.flatMap((item) => [item.jiahao?.type || item.type, item.nailoong?.archetype]),
    ...(session?.unlocks || []),
  ].filter(Boolean)), [history, session]);
  const rotateRecovery = async () => {
    try { const result = await postJson('/api/social/identity/recovery', {}); setRecoveryCode(result.recoveryCode); setIdentityNotice('新口令已生成，旧口令立即失效。'); }
    catch (error) { setIdentityNotice(error.message); }
  };
  const recover = async () => {
    try { await postJson('/api/social/identity/recover', { recoveryCode: recoveryInput }); window.location.reload(); }
    catch (error) { setIdentityNotice(error.message); }
  };
  const deleteIdentity = async () => {
    if (!window.confirm('删除后，你创建的联赛、成员关系和解锁将无法找回。继续吗？')) return;
    try { await postJson('/api/social/identity/delete', {}); setSession(null); setIdentityNotice('联赛身份与资料已删除。'); }
    catch (error) { setIdentityNotice(error.message); }
  };
  return <main className="archive-page">
    <header className="archive-title"><div><h1>人格档案</h1><p>同一种抽象，也有不同的进化路线。</p></div><div className="archive-count"><span>已留存鉴定</span><strong>{history.length}</strong></div></header>
    <div className="archive-tabs" role="tablist" aria-label="人格档案类型"><button type="button" role="tab" aria-selected={tab === 'jiahao'} className={tab === 'jiahao' ? 'active' : ''} onClick={() => setTab('jiahao')}>嘉豪物种</button><button type="button" role="tab" aria-selected={tab === 'nailoong'} className={tab === 'nailoong' ? 'active' : ''} onClick={() => setTab('nailoong')}>奶龙人格</button></div>
    <section className="persona-gallery">{items.map(([name, summary, asset], index) => { const isUnlocked = unlocked.has(name) || (index === 0 && history.length > 0); return <article key={name} className={isUnlocked ? 'unlocked' : 'locked'}>{tab === 'nailoong' ? <img src={`/assets/nailoong/${asset}.webp`} alt={isUnlocked ? `${name}的奶蛙状态` : '尚未解锁的奶龙人格'}/> : <JiahaoPortrait variant={asset} label={isUnlocked ? `${name}的嘉豪人物状态` : '尚未解锁的嘉豪人格'}/>}<h2>{isUnlocked ? name : '待解锁人格'}</h2><p>{isUnlocked ? summary : tab === 'jiahao' ? '完成嘉豪鉴定，命中该物种后解锁。' : '完成奶龙反应局，命中该人格后解锁。'}</p></article>; })}</section>
    <section className="history-section"><header><div><h2>我的鉴定记录</h2><p>记录只保存在当前浏览器，当前显示{tab === 'jiahao' ? '嘉豪' : '奶龙'}结果。</p></div>{history.length ? <button type="button" className="text-button" onClick={onClear}>清空记录</button> : null}</header>{history.length ? <div className="history-grid">{history.map((item) => <button type="button" key={`${item.id}-${item.createdAt || ''}`} onClick={() => onSelectHistory(item)}><time>{item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : '旧记录'}</time><span><b>{tab === 'jiahao' ? item.jiahao?.score ?? item.score : item.nailoong?.score ?? '--'}</b><small>{tab === 'jiahao' ? '嘉豪' : '奶龙'}</small></span><strong>{tab === 'jiahao' ? item.jiahao?.type || item.type : item.nailoong?.archetype || '尚未玩奶龙'}</strong><Icon name="arrow"/></button>)}</div> : <div className="empty-archive"><Icon name="archive" size={38}/><strong>还没有鉴定记录</strong><p>去测一次，第一份档案就有了。</p></div>}</section>
    <section className="identity-center"><header><div><h2>联赛身份</h2><p>免注册不等于无法找回，你可以用一次性口令恢复房间。</p></div></header><div className="identity-actions"><label>恢复口令<input value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX"/></label><button type="button" className="outline-button" onClick={recover} disabled={!recoveryInput.trim()}>恢复联赛</button>{session?.rooms?.length ? <button type="button" className="outline-button" onClick={rotateRecovery}>换新恢复口令</button> : null}<button type="button" className="text-button danger" onClick={deleteIdentity}>删除联赛身份与资料</button></div>{recoveryCode ? <code className="identity-recovery-code">{recoveryCode}</code> : null}{identityNotice ? <p role="status">{identityNotice}</p> : null}</section>
  </main>;
}
