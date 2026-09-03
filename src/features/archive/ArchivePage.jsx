import { useState } from 'react';
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
  const items = tab === 'jiahao' ? JIAHAO_TYPES : NAILOONG_TYPES;
  return <main className="archive-page">
    <header className="archive-title"><div><h1>人格档案</h1><p>同一种抽象，也有不同的进化路线。</p></div><div className="archive-count"><span>已留存鉴定</span><strong>{history.length}</strong></div></header>
    <div className="archive-tabs" role="tablist" aria-label="人格档案类型"><button type="button" role="tab" aria-selected={tab === 'jiahao'} className={tab === 'jiahao' ? 'active' : ''} onClick={() => setTab('jiahao')}>嘉豪物种</button><button type="button" role="tab" aria-selected={tab === 'nailoong'} className={tab === 'nailoong' ? 'active' : ''} onClick={() => setTab('nailoong')}>奶龙人格</button></div>
    <section className="persona-gallery">{items.map(([name, summary, asset]) => <article key={name}>{tab === 'nailoong' ? <img src={`/assets/nailoong/${asset}.webp`} alt={`${name}的奶蛙状态`}/> : <JiahaoPortrait variant={asset} label={`${name}的嘉豪人物状态`}/>}<h2>{name}</h2><p>{summary}</p></article>)}</section>
    <section className="history-section"><header><div><h2>我的鉴定记录</h2><p>记录只保存在当前浏览器，当前显示{tab === 'jiahao' ? '嘉豪' : '奶龙'}结果。</p></div>{history.length ? <button type="button" className="text-button" onClick={onClear}>清空记录</button> : null}</header>{history.length ? <div className="history-grid">{history.map((item) => <button type="button" key={`${item.id}-${item.createdAt || ''}`} onClick={() => onSelectHistory(item)}><time>{item.createdAt ? new Date(item.createdAt).toLocaleDateString('zh-CN') : '旧记录'}</time><span><b>{tab === 'jiahao' ? item.jiahao?.score ?? item.score : item.nailoong?.score ?? '--'}</b><small>{tab === 'jiahao' ? '嘉豪' : '奶龙'}</small></span><strong>{tab === 'jiahao' ? item.jiahao?.type || item.type : item.nailoong?.archetype || '尚未玩奶龙'}</strong><Icon name="arrow"/></button>)}</div> : <div className="empty-archive"><Icon name="archive" size={38}/><strong>还没有鉴定记录</strong><p>去测一次，第一份档案就有了。</p></div>}</section>
  </main>;
}
