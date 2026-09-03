import { useEffect, useState } from 'react';
import { createBattleCard, downloadDataUrl } from '../../app/poster';
import { postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { JiahaoPortrait } from '../../components/JiahaoPortrait';
import { makeSocialResultPayload } from '../../validation';
import { trackProductEvent } from '../../telemetry';

const JIAHAO_DIMENSIONS = [
  ['mystery', '神秘感'],
  ['flex', '松弛力'],
  ['niche', '小众度'],
  ['deep', '深情值'],
  ['show', '表现力'],
  ['language', '豪言力'],
];

export function ResultPage({ result, onReset, onNavigate, onRoomOpen }) {
  const [poster, setPoster] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const jiahao = result.jiahao || result;
  const resultType = jiahao.type || result.type;
  const verdict = result.verdict || result.comment;

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
    const file = new File([blob], '嘉豪战绩卡.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: '我的嘉豪鉴定', text: `我的嘉豪指数是 ${jiahao.score}。你敢来测吗？`, url: posterUrl, files: [file] });
      return;
    }
    downloadDataUrl(poster, `嘉豪战绩-${jiahao.score}.png`);
    if (navigator.clipboard && posterUrl) await navigator.clipboard.writeText(posterUrl).catch(() => {});
    setNotice('战绩卡已下载，挑战链接也已复制。');
  };

  return <main className="result-v2-page">
    <header className="result-title-row"><h1>鉴定结果</h1><button type="button" className="outline-button" onClick={onReset}>再测一次 <Icon name="reset" size={18}/></button></header>
    <p className="source-notice">{result.fallbackNotice ? '这次没连上，先给你一个基础成绩。' : '本次结论由 AI 生成，仅供娱乐，不代表真实评价。'}</p>
    <section className="result-layout">
      <div className="verdict-sheet">
        <div className="result-score"><span>嘉豪指数</span><strong>{jiahao.score}</strong></div>
        <div className="verdict-copy"><span>你的豪气类型</span><h2>{resultType}</h2><p>{verdict}</p></div>
      </div>
      <div className="result-analysis">
        <JiahaoPortrait variant={jiahao.score} label={`${resultType}的嘉豪人物状态`} className="result-jiahao-portrait"/>
        <div className="dimension-values" aria-label="六维豪气力">
          {JIAHAO_DIMENSIONS.map(([key, label]) => <div key={key}><span>{label}</span><strong>{jiahao.dimensions?.[key] ?? result.dimensions?.[key] ?? '--'}</strong></div>)}
        </div>
        <div className="evidence-paper"><h3>你暴露了这三件事</h3><ol>{(result.evidence || []).slice(0, 3).map((item, index) => <li key={`${item}-${index}`}><span>0{index + 1}</span>{item}</li>)}</ol></div>
      </div>
      <aside className="share-card-preview" aria-label="战绩卡预览"><span>战绩卡预览</span><div><header>豪气宇宙</header><div className="mini-scores"><b>{jiahao.score}<small>嘉豪指数</small></b></div><h3>{resultType}</h3><JiahaoPortrait variant={jiahao.score} label="战绩卡中的嘉豪人物"/><p>{verdict}</p></div></aside>
    </section>
    {notice ? <p className="form-message info" role="status">{notice}</p> : null}
    <div className="result-ctas"><button type="button" className="primary-button" disabled={busy} onClick={generatePoster}><Icon name="archive"/> {busy ? '正在生成…' : '生成战绩卡'}</button><button type="button" className="yellow-button" disabled={busy} onClick={createChallenge}><Icon name="users"/> 拉好友来测</button><button type="button" className="outline-button" onClick={onReset}><Icon name="reset"/> 再测一次</button></div>
    <section className="next-play"><strong>接着玩</strong><button type="button" onClick={() => onNavigate('friends')}>拉好友比豪气 <Icon name="arrow"/></button><button type="button" className="nailoong-link" onClick={() => onNavigate('lab')}>去玩奶龙反应局 <Icon name="arrow"/></button></section>
    {poster ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPoster('')}><section className="poster-dialog" role="dialog" aria-modal="true" aria-label="嘉豪战绩卡"><button type="button" autoFocus className="dialog-close" aria-label="关闭战绩卡" onClick={() => setPoster('')}><Icon name="close"/></button><img src={poster} alt={`嘉豪指数 ${jiahao.score} 的战绩卡`}/><div><h2>战绩卡已生成</h2><p>图片只包含公开分数和判词，不包含你的原始素材。</p><button type="button" className="primary-button" onClick={sharePoster}><Icon name="share"/> 分享或保存</button></div></section></div> : null}
  </main>;
}
