import { useEffect, useRef, useState } from 'react';
import { apiRequest, postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { AiProgress } from '../../components/AiProgress';
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

function HaoQuoteStudio({ inputRef }) {
  const [input, setInput] = useState('今天有点累。');
  const [mode, setMode] = useState('hao');
  const [level, setLevel] = useState('豪气冲天');
  const [style, setStyle] = useState('高冷');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [notice, setNotice] = useState('');

  const generate = async () => {
    setBusy(true);
    setStartedAt(Date.now());
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
    context.fillStyle = '#f7f4ee';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#145bea';
    context.fillRect(0, 0, 1080, 22);
    context.fillStyle = '#11110f';
    context.font = '900 54px "PingFang SC", sans-serif';
    context.fillText('豪气宇宙', 84, 112);
    context.fillStyle = '#f2c51d';
    context.fillRect(84, 176, 154, 16);
    context.fillStyle = '#11110f';
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
    context.strokeStyle = 'rgba(17,17,15,.25)';
    context.beginPath();
    context.moveTo(84, 1264);
    context.lineTo(996, 1264);
    context.stroke();
    context.fillStyle = '#625f57';
    context.font = '700 34px "PingFang SC", sans-serif';
    context.fillText('一句话豪化 · 结果仅供娱乐', 84, 1340);
    const link = document.createElement('a');
    link.download = '嘉豪语录卡.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return <section className="hao-quote-studio" id="hao-quote-studio">
    <header className="section-heading"><h2>把一句话豪化</h2><p>输入一句普通话，看看嘉豪会怎么说。</p></header>
    <div className="hao-quote-body">
      <div className="hao-quote-controls">
        <label htmlFor="hao-quote-input">要豪化的原句</label><textarea ref={inputRef} id="hao-quote-input" maxLength={300} value={input} onChange={(event) => setInput(event.target.value)}/>
        <div className="hao-switch" role="group" aria-label="转换方向"><button type="button" aria-pressed={mode === 'hao'} onClick={() => setMode('hao')}>豪化</button><button type="button" aria-pressed={mode === 'dehao'} onClick={() => setMode('dehao')}>一键说人话</button></div>
        <details className="hao-advanced"><summary>调整豪气风格</summary><fieldset disabled={mode === 'dehao'}><legend>豪气等级</legend><div className="hao-option-grid levels">{QUOTE_LEVELS.map((item) => <button type="button" key={item} aria-pressed={level === item} onClick={() => setLevel(item)}>{item}</button>)}</div></fieldset><fieldset disabled={mode === 'dehao'}><legend>表达风格</legend><div className="hao-option-grid styles">{QUOTE_STYLES.map((item) => <button type="button" key={item} aria-pressed={style === item} onClick={() => setStyle(item)}>{item}</button>)}</div></fieldset></details>
        <button type="button" className="primary-button" disabled={busy || input.trim().length < 2} onClick={generate}>{busy ? '豪气正在汇聚…' : mode === 'dehao' ? '一键把嘉豪说人话' : '生成嘉豪语录'} <Icon name="arrow"/></button>
      </div>
      <div className="hao-quote-output">{busy ? <AiProgress label="AI 语录" kind="quote" startedAt={startedAt} /> : result ? <><span>这句很豪</span><blockquote>{result.output}</blockquote><p className="hao-fallback-note">{result.fallback ? '这次用了备用玩法，结果仅供娱乐。' : '这句话由 AI 生成，请当作娱乐灵感。'}</p><div className="hao-output-actions"><button type="button" className="outline-button" onClick={copy}><Icon name="copy" size={17}/>复制</button><button type="button" className="outline-button" onClick={download}><Icon name="download" size={17}/>保存语录卡</button></div>{notice ? <p role="status">{notice}</p> : null}</> : <strong>放一句普通话进来，<br/>看它能有多豪。</strong>}</div>
    </div>
  </section>;
}

function HaoPkArena({ open, onToggle }) {
  const [first, setFirst] = useState('我一般不解释，懂的都懂。');
  const [second, setSecond] = useState('这波回调只是长期价值的必经之路。');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [error, setError] = useState('');

  const start = async () => {
    if (!consent) return setError('请先确认双方素材授权。');
    setBusy(true); setStartedAt(Date.now()); setError('');
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
    <button type="button" className="hao-panel-heading" onClick={onToggle} aria-expanded={open}><div><strong>双人豪气 PK</strong><small>双方各出一句话，看看谁更豪</small></div><Icon name="sword"/></button>
    {open ? <div className="hao-pk-body"><div className="hao-pk-inputs"><label>甲方豪气样本<textarea value={first} onChange={(event) => setFirst(event.target.value)}/></label><b>VS</b><label>乙方豪气样本<textarea value={second} onChange={(event) => setSecond(event.target.value)}/></label></div><label className="consent-row"><input aria-label="确认双方素材授权" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}/><span>我确认有权使用双方文字。</span></label>{error ? <p className="form-message error" role="alert">{error}</p> : null}<button type="button" className="primary-button hao-pk-button" disabled={busy || first.trim().length < 2 || second.trim().length < 2} onClick={start}>{busy ? '正在判…' : '开始豪气 PK'} <Icon name="sword"/></button>{busy ? <AiProgress label="AI PK" kind="duel" startedAt={startedAt} compact/> : null}{result ? <div className="hao-pk-result"><small>本局结果</small><h3>{result.battle.title}</h3><p>{result.battle.reason}</p><div>{result.participants.map((item, index) => <span key={`${item.name}-${index}`}><b>{item.name || (index ? '乙方' : '甲方')}</b><strong>{item.score}</strong><em>{item.type}</em></span>)}</div>{result.fallback ? <small>这次用了备用玩法，结果仅供娱乐。</small> : null}</div> : null}</div> : null}
  </section>;
}

function FeedbackEntry() {
  const dialogRef = useRef(null);
  const [category, setCategory] = useState('experience');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await postJson('/api/feedback', { category, message, contact });
      setNotice('已收到，谢谢你认真告诉我们。');
      setMessage(''); setContact('');
    } catch (nextError) {
      setError(nextError.message || '反馈暂时没有送达，请稍后再试。');
    } finally { setBusy(false); }
  };

  return <>
    <button type="button" className="feedback-entry" onClick={() => { setNotice(''); setError(''); dialogRef.current?.showModal(); }}><span>意见反馈</span><small>把不爽的地方直接告诉我们</small><Icon name="arrow"/></button>
    <dialog ref={dialogRef} className="feedback-dialog" aria-labelledby="feedback-title" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current.close(); }}>
      <form onSubmit={submit}>
        <button type="button" className="dialog-close" aria-label="关闭意见反馈" onClick={() => dialogRef.current?.close()}><Icon name="close"/></button>
        <span className="feedback-kicker">SAY IT STRAIGHT</span><h2 id="feedback-title">告诉我们哪里还能更好</h2><p>产品体验、生成效果、Bug 或新想法，都可以直说。</p>
        <label htmlFor="feedback-category">反馈类型</label><select id="feedback-category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="experience">使用体验</option><option value="generation">生成效果</option><option value="bug">Bug 报告</option><option value="idea">功能想法</option><option value="other">其他</option></select>
        <label htmlFor="feedback-message">反馈内容</label><textarea id="feedback-message" value={message} maxLength={1000} required minLength={2} onChange={(event) => setMessage(event.target.value)} placeholder="具体说说在哪一步、发生了什么…"/>
        <label htmlFor="feedback-contact">联系方式 <small>可选</small></label><input id="feedback-contact" value={contact} maxLength={120} onChange={(event) => setContact(event.target.value)} placeholder="微信 / 邮箱，方便我们回访"/>
        {error ? <p className="form-message error" role="alert">{error}</p> : null}{notice ? <p className="form-message success" role="status">{notice}</p> : null}
        <button type="submit" className="primary-button" disabled={busy || message.trim().length < 2}>{busy ? '正在送达…' : '提交反馈'} <Icon name="arrow"/></button>
        <small className="feedback-privacy">只保存你主动提交的反馈和联系方式，不会附带鉴定或生成内容。</small>
      </form>
    </dialog>
  </>;
}

export function HaoPage({ onNavigate, onRoomOpen }) {
  const [pkOpen, setPkOpen] = useState(false);
  const [activeLeague, setActiveLeague] = useState(null);
  const quoteInputRef = useRef(null);
  useEffect(() => {
    let active = true;
    apiRequest('/api/social/session').then((session) => {
      const room = session.rooms?.find((item) => item.room_type === 'league');
      if (active) setActiveLeague(room || null);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const focusQuote = () => {
    document.getElementById('hao-quote-studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => quoteInputRef.current?.focus(), 320);
  };

  return <main className="hao-page">
    <FeedbackEntry/>
    <header className="hao-hero league-first-hero"><div className="hao-hero-copy"><h1 aria-label="每天一句，七天决出嘉豪之神"><span>每天一句</span><span>七天决出嘉豪之神</span></h1><p>发到微信群，好友 30 秒同题作答。AI 先判，群友再投，每晚锁榜。</p><div className="hero-actions"><button type="button" className="primary-button" onClick={() => activeLeague ? onRoomOpen(activeLeague.code) : onNavigate('friends')}>{activeLeague ? '回到今天的好友联赛' : '创建 7 日好友联赛'} <Icon name="arrow"/></button><button type="button" className="outline-button" onClick={() => onNavigate('friends')}>输入房间码</button></div><small className="league-privacy-line"><Icon name="lock" size={15}/> 免注册 · 答案只对房间成员可见 · 赛季后 7 天删除原句</small></div><figure className="hao-hero-media"><img src="/assets/jiahao/hao-universe-hero.webp" alt="巷子里笑得很开心的嘉豪" width="960" height="1200" fetchPriority="high"/><figcaption>今天这题，你最有戏。</figcaption></figure></header>
    <section className="free-play-heading"><span>FREE PLAY</span><h2>自由玩</h2><p>不想等好友？单人鉴定、语录和图片创作都还在。</p><button type="button" className="outline-button" onClick={() => onNavigate('assay')}>去做嘉豪鉴定 <Icon name="arrow"/></button></section>
    <HaoQuoteStudio inputRef={quoteInputRef}/>
    <section className="hao-play-rail"><article><div><h2>和好友比一局</h2><p>双方各出一句话，看看谁更豪。</p></div><button type="button" className="outline-button" onClick={() => setPkOpen((value) => !value)} aria-expanded={pkOpen}>{pkOpen ? '收起 PK' : '双人豪气 PK'} <Icon name="arrow"/></button></article><article className="hao-archive-door"><JiahaoPortrait variant={2} label="经典嘉豪人物图鉴预览" className="hao-archive-preview"/><div><h2>嘉豪出没图鉴</h2><p>六种嘉豪状态，原来的经典人物都在。</p></div><button type="button" className="outline-button" onClick={() => onNavigate('archive')}>去看图鉴 <Icon name="arrow"/></button></article></section>
    <HaoPkArena open={pkOpen} onToggle={() => setPkOpen((value) => !value)}/>
  </main>;
}
