import { useState } from 'react';
import { postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { JiahaoPortrait } from '../../components/JiahaoPortrait';
import { makeFallbackAssessment } from '../../validation';
import { trackProductEvent } from '../../telemetry';

const QUOTE_LEVELS = ['豪气初现', '豪气逼人', '豪气冲天', '自在极意豪'];
const QUOTE_STYLES = ['深情', '高冷', '小众', '无意炫耀', '战斗', '朋友圈', '个性签名', '评论区'];

function fallbackQuote(input, mode, level, style) {
  const sentence = input.trim().replace(/[。！？!?]+$/, '');
  if (mode === 'dehao') return `${sentence.replace(/懂的都懂/g, '这里不展开说明') || '这件事比较复杂'}，我直接说明一下。`;
  const endings = {
    豪气初现: '不过也没什么。',
    豪气逼人: '反正这些事一直都是我自己扛。',
    豪气冲天: '只是有些事情，说了你们也不一定懂。',
    自在极意豪: '事情会过去，但我不会。算了，你记住就好。',
  };
  return `${sentence}。${endings[level]}${style === '小众' ? ' 这种感觉本来就不是给所有人理解的。' : ''}`;
}

function HaoQuoteStudio() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('今天有点累。');
  const [mode, setMode] = useState('hao');
  const [level, setLevel] = useState('豪气冲天');
  const [style, setStyle] = useState('高冷');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const generate = async () => {
    setBusy(true);
    setNotice('');
    trackProductEvent('lab_game_started', { game: 'hao_quote' });
    try {
      const payload = await postJson('/api/quote', { input, mode, level, style });
      setResult({ output: payload.output, source: payload.source || '云端文字大模型', fallback: false });
    } catch {
      setResult({ output: fallbackQuote(input, mode, level, style), source: '豪之算法', fallback: true });
    } finally {
      setBusy(false);
      trackProductEvent('lab_game_completed', { game: 'hao_quote' });
    }
  };

  const copy = async () => {
    if (!result?.output) return;
    try { await navigator.clipboard.writeText(result.output); setNotice('已复制，适合若无其事地发出去。'); }
    catch { setNotice('复制受限，请长按语录手动复制。'); }
  };

  const download = () => {
    if (!result?.output) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1440;
    const context = canvas.getContext('2d');
    context.fillStyle = '#efca16';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#11110f';
    context.font = '900 54px "PingFang SC", sans-serif';
    context.fillText('嘉豪鉴定所', 84, 112);
    context.font = '900 86px "PingFang SC", sans-serif';
    const chars = [...result.output];
    const lines = [];
    let line = '';
    for (const char of chars) {
      const next = line + char;
      if (context.measureText(next).width > 900) { lines.push(line); line = char; }
      else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 8).forEach((item, index) => context.fillText(item, 84, 360 + index * 118));
    context.font = '700 34px "PingFang SC", sans-serif';
    context.fillText('豪气仅供娱乐，转发才有意义。', 84, 1340);
    const link = document.createElement('a');
    link.download = '嘉豪语录卡.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return <section className={`hao-panel ${open ? 'open' : ''}`}>
    <button type="button" className="hao-panel-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}><div><strong>嘉豪语录</strong><small>把一句普通话，变得很有故事</small></div><Icon name="spark"/></button>
    {open ? <div className="hao-quote-body">
      <div className="hao-quote-controls">
        <label htmlFor="hao-quote-input">要豪化的原句</label><textarea id="hao-quote-input" maxLength={300} value={input} onChange={(event) => setInput(event.target.value)}/>
        <div className="hao-switch" role="group" aria-label="转换方向"><button type="button" aria-pressed={mode === 'hao'} onClick={() => setMode('hao')}>豪化</button><button type="button" aria-pressed={mode === 'dehao'} onClick={() => setMode('dehao')}>一键说人话</button></div>
        <fieldset disabled={mode === 'dehao'}><legend>豪气等级</legend><div className="hao-option-grid levels">{QUOTE_LEVELS.map((item) => <button type="button" key={item} aria-pressed={level === item} onClick={() => setLevel(item)}>{item}</button>)}</div></fieldset>
        <fieldset disabled={mode === 'dehao'}><legend>表达风格</legend><div className="hao-option-grid styles">{QUOTE_STYLES.map((item) => <button type="button" key={item} aria-pressed={style === item} onClick={() => setStyle(item)}>{item}</button>)}</div></fieldset>
        <button type="button" className="primary-button" disabled={busy || input.trim().length < 2} onClick={generate}>{busy ? '豪气正在汇聚…' : mode === 'dehao' ? '一键把嘉豪说人话' : '生成嘉豪语录'} <Icon name="arrow"/></button>
      </div>
      <div className="hao-quote-output">{result ? <><span>这句很豪</span><blockquote>{result.output}</blockquote>{result.fallback ? <p className="hao-fallback-note">这次用了备用玩法，结果仅供娱乐。</p> : null}<div className="hao-output-actions"><button type="button" className="outline-button" onClick={copy}><Icon name="copy" size={17}/>复制</button><button type="button" className="outline-button" onClick={download}><Icon name="download" size={17}/>保存语录卡</button></div>{notice ? <p role="status">{notice}</p> : null}</> : <strong>放一句普通话进来，<br/>看它能有多豪。</strong>}</div>
    </div> : null}
  </section>;
}

function HaoPkArena() {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState('我一般不解释，懂的都懂。');
  const [second, setSecond] = useState('这波回调只是长期价值的必经之路。');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    if (!consent) return setError('请先确认双方素材授权。');
    setBusy(true); setError('');
    trackProductEvent('lab_game_started', { game: 'hao_pk' });
    try {
      const payload = await postJson('/api/pk', { participants: [{ name: '甲方', mode: 'text', input: first }, { name: '乙方', mode: 'text', input: second }] }, { signal: AbortSignal.timeout(30_000) });
      setResult(payload);
    } catch {
      const participants = [first, second].map((input, index) => ({ name: index ? '乙方' : '甲方', ...makeFallbackAssessment(input, 'text', []) }));
      const winner = Math.abs(participants[0].score - participants[1].score) <= 1 ? 'tie' : participants[0].score > participants[1].score ? 'A' : 'B';
      setResult({ participants, battle: { winner, title: winner === 'tie' ? '双方豪气同频' : `${winner === 'A' ? '甲方' : '乙方'}豪气胜出`, reason: '这局由备用规则裁决，仅供娱乐。' }, fallback: true });
    } finally {
      setBusy(false);
      trackProductEvent('lab_game_completed', { game: 'hao_pk' });
    }
  };

  return <section className={`hao-panel ${open ? 'open' : ''}`}>
    <button type="button" className="hao-panel-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}><div><strong>双人豪气 PK</strong><small>放两句话进来，看谁更豪</small></div><Icon name="sword"/></button>
    {open ? <div className="hao-pk-body"><div className="hao-pk-inputs"><label>甲方豪气样本<textarea value={first} onChange={(event) => setFirst(event.target.value)}/></label><b>VS</b><label>乙方豪气样本<textarea value={second} onChange={(event) => setSecond(event.target.value)}/></label></div><label className="consent-row"><input aria-label="确认双方素材授权" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/><span>我确认有权使用双方文字。</span></label>{error ? <p className="form-message error" role="alert">{error}</p> : null}<button type="button" className="primary-button hao-pk-button" disabled={busy || first.trim().length < 2 || second.trim().length < 2} onClick={start}>{busy ? '正在判…' : '开始豪气 PK'} <Icon name="sword"/></button>{result ? <div className="hao-pk-result"><small>本局结果</small><h3>{result.battle.title}</h3><p>{result.battle.reason}</p><div>{result.participants.map((item, index) => <span key={`${item.name}-${index}`}><b>{item.name || (index ? '乙方' : '甲方')}</b><strong>{item.score}</strong><em>{item.type}</em></span>)}</div>{result.fallback ? <small>这次用了备用玩法，结果仅供娱乐。</small> : null}</div> : null}</div> : null}
  </section>;
}

export function HaoPage({ onNavigate }) {
  return <main className="hao-page">
    <header className="hao-hero"><div><h1>你有多豪？</h1><p>放张照片或一句话进来，看看豪气藏得有多深。</p><button type="button" className="yellow-button" onClick={() => onNavigate('assay')}>测测我有多豪 <Icon name="arrow"/></button></div><JiahaoPortrait variant={4} label="戴墨镜穿夹克的嘉豪" className="hao-hero-portrait"/></header>
    <HaoQuoteStudio/>
    <HaoPkArena/>
    <section className="hao-panel hao-archive-entry"><div className="hao-panel-heading static"><div><strong>嘉豪出没图鉴</strong><small>六种高频状态，全员有脸</small></div><Icon name="archive"/></div><div className="hao-entry-body"><p>口罩豪、股票豪、计算机豪，你是哪一种？</p><button type="button" className="yellow-button" onClick={() => onNavigate('archive')}>去翻图鉴 <Icon name="arrow"/></button></div></section>
  </main>;
}
