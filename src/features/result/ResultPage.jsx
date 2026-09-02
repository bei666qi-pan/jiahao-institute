import { useEffect, useState } from 'react';
import { createBattleCard, downloadDataUrl } from '../../app/poster';
import { postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { makeSocialResultPayload } from '../../validation';
import { trackProductEvent } from '../../telemetry';

const NAILOONG_DIMENSIONS = [
  ['hardMouth', '嘴硬'],
  ['deadpan', '呆愣'],
  ['hungerResilience', '逆风扛饿'],
  ['abstractReaction', '抽象反应'],
  ['cameraSense', '镜头感'],
  ['friendPrank', '朋友迫害欲'],
];

export function ResultPage({ result, onReset, onNavigate, onRoomOpen }) {
  const [poster, setPoster] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const jiahao = result.jiahao || result;
  const nailoong = result.nailoong;

  useEffect(() => {
    if (!poster) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setPoster(''); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [poster]);

  const generatePoster = async () => {
    setBusy(true);
    setNotice('');
    try {
      let shareUrl = window.location.origin;
      try {
        const challenge = await postJson('/api/social/rooms', {
          name: '谁更抽象挑战',
          nickname: localStorage.getItem('jiahao-nickname') || '奶龙本人',
          roomType: 'challenge',
          memberLimit: 20,
          ...makeSocialResultPayload(result),
        });
        shareUrl = `${window.location.origin}/r/${challenge.code}`;
        trackProductEvent('challenge_created', { roomType: 'challenge' });
      } catch {
        setNotice('好友房暂不可用，战绩卡二维码将先指向鉴定入口。');
      }
      const dataUrl = await createBattleCard(result, shareUrl);
      setPoster(dataUrl);
      setPosterUrl(shareUrl);
      trackProductEvent('share_clicked', { mode: 'battle_card' });
    } catch {
      setNotice('战绩卡生成失败，请刷新后再试。');
    } finally { setBusy(false); }
  };

  const createChallenge = async () => {
    setBusy(true);
    setNotice('');
    trackProductEvent('challenge_created', { stage: 'started' });
    try {
      const payload = await postJson('/api/social/rooms', {
        name: '谁更抽象挑战',
        nickname: localStorage.getItem('jiahao-nickname') || '奶龙本人',
        roomType: 'challenge',
        memberLimit: 20,
        ...makeSocialResultPayload(result),
      });
      trackProductEvent('challenge_created', { stage: 'completed' });
      onRoomOpen(payload.code);
    } catch (error) {
      setNotice(`${error.message}；你也可以先生成战绩卡发给好友。`);
    } finally { setBusy(false); }
  };

  const sharePoster = async () => {
    if (!poster) return;
    const blob = await (await fetch(poster)).blob();
    const file = new File([blob], '嘉豪双指数战绩卡.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: '我的嘉豪双指数', text: `嘉豪 ${jiahao.score}，奶龙 ${nailoong.score}。你敢来测吗？`, url: posterUrl, files: [file] });
      return;
    }
    downloadDataUrl(poster, `嘉豪战绩-${jiahao.score}-${nailoong.score}.png`);
    if (navigator.clipboard && posterUrl) await navigator.clipboard.writeText(posterUrl).catch(() => {});
    setNotice('战绩卡已下载，挑战链接也已复制。');
  };

  return <main className="result-v2-page">
    <header className="result-title-row"><h1>鉴定结果</h1><button type="button" className="outline-button" onClick={onReset}>再测一次 <Icon name="reset" size={18}/></button></header>
    <p className="source-notice">{result.fallbackNotice ? '云端暂时没接住，当前展示基础算法成绩。' : `${result.source || '规则算法'}生成娱乐信号与判词，指数由版本化规则计算。`} 你的原始内容不会进入历史或好友榜。</p>
    <section className="result-layout">
      <div className="verdict-sheet">
        <div className="score-duel"><div><span>嘉豪指数</span><strong className="blue">{jiahao.score}</strong></div><em>VS</em><div><span>奶龙指数</span><strong className="yellow">{nailoong.score}</strong></div></div>
        <div className="verdict-copy"><small>鉴定结果</small><h2>{nailoong.archetype}</h2><p>{nailoong.verdict || result.verdict}</p></div>
      </div>
      <div className="result-analysis">
        <div className="result-mascot"><img src="/assets/nailoong/arms.webp" alt="抱臂站立的抽象奶蛙"/><span>奶味逼人<br/>心态超稳</span></div>
        <div className="dimension-bars" aria-label="六维奶龙成分">
          {NAILOONG_DIMENSIONS.map(([key, label]) => <div key={key}><span>{label}</span><i><b style={{ width: `${nailoong.dimensions[key]}%` }}/></i><strong>{nailoong.dimensions[key]}</strong></div>)}
        </div>
        <div className="evidence-paper"><h3>你暴露了这三件事</h3><ol>{(result.evidence || []).slice(0, 3).map((item, index) => <li key={`${item}-${index}`}><span>0{index + 1}</span>{item}</li>)}</ol></div>
      </div>
      <aside className="share-card-preview" aria-label="战绩卡预览"><span>分享战绩卡</span><div><header>嘉豪鉴定所</header><div className="mini-scores"><b>{jiahao.score}<small>嘉豪</small></b><b>{nailoong.score}<small>奶龙</small></b></div><h3>{nailoong.archetype}</h3><img src="/assets/nailoong/arms.webp" alt=""/><p>{nailoong.verdict}</p></div></aside>
    </section>
    {notice ? <p className="form-message info" role="status">{notice}</p> : null}
    <div className="result-ctas"><button type="button" className="primary-button" disabled={busy} onClick={generatePoster}><Icon name="archive"/> {busy ? '正在生成…' : '生成战绩卡'}</button><button type="button" className="yellow-button" disabled={busy} onClick={createChallenge}><Icon name="users"/> 拉好友来测</button><button type="button" className="outline-button" onClick={onReset}><Icon name="reset"/> 再测一次</button></div>
    <section className="next-play"><strong>不服？那就来场真正的较量！</strong><button type="button" onClick={() => onNavigate('lab')}>去奶龙反应局翻盘 <Icon name="arrow"/></button><button type="button" onClick={() => onNavigate('friends')}>发起好友整活房 <Icon name="arrow"/></button></section>
    {poster ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPoster('')}><section className="poster-dialog" role="dialog" aria-modal="true" aria-label="双指数战绩卡"><button type="button" autoFocus className="dialog-close" aria-label="关闭战绩卡" onClick={() => setPoster('')}><Icon name="close"/></button><img src={poster} alt={`嘉豪指数 ${jiahao.score}，奶龙指数 ${nailoong.score} 的战绩卡`}/><div><h2>战绩卡已生成</h2><p>图片只包含公开分数和判词，不包含你的原始素材。</p><button type="button" className="primary-button" onClick={sharePoster}><Icon name="share"/> 分享或保存</button></div></section></div> : null}
  </main>;
}
