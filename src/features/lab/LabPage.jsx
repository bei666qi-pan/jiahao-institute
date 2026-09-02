import { useEffect, useState } from 'react';
import { apiRequest, postJson, todayInShanghai } from '../../app/api';
import { Icon } from '../../components/Icon';
import { makeFallbackAssessment } from '../../validation';
import { trackProductEvent } from '../../telemetry';

const ASSETS = {
  toes: '/assets/nailoong/toes.webp',
  umbrella: '/assets/nailoong/umbrella.webp',
  arms: '/assets/nailoong/arms.webp',
  cat: '/assets/nailoong/cat.webp',
};

function ReactionGame({ latestResult, onReactionComplete }) {
  const [challenge, setChallenge] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest(`/api/reactions/daily?date=${todayInShanghai()}`)
      .then((payload) => active && setChallenge(payload))
      .catch((nextError) => active && setError(nextError.message));
    return () => { active = false; };
  }, []);

  const choose = async (questionId, optionId) => {
    if (!challenge || busy) return;
    if (!answers.length) trackProductEvent('lab_game_started', { game: 'reaction' });
    const next = [...answers, { questionId, optionId }];
    setAnswers(next);
    if (next.length < challenge.questions.length) return;
    setBusy(true);
    try {
      const scored = await postJson('/api/reactions/score', { challengeId: challenge.challengeId, date: challenge.date, answers: next });
      setResult(scored);
      onReactionComplete(scored);
      trackProductEvent('lab_game_completed', { game: 'reaction', outcome: scored.nailoong.archetype });
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); }
  };

  if (error) return <div className="game-error" role="alert"><strong>奶龙反应局暂时卡住了</strong><p>{error}</p></div>;
  if (!challenge) return <div className="game-loading">正在翻找今天的抽象题目…</div>;
  if (result) return <div className="reaction-result"><img src="/assets/nailoong/arms.webp" alt="抱臂的抽象奶蛙"/><div><span>本局奶龙指数</span><strong>{result.nailoong.score}</strong><h3>{result.nailoong.archetype}</h3><p>{result.nailoong.verdict}</p><button type="button" className="outline-button" onClick={() => { setAnswers([]); setResult(null); }}>再来一局 <Icon name="reset"/></button></div></div>;
  if (busy || answers.length >= challenge.questions.length) return <div className="game-loading" aria-live="polite">正在汇总你的抽象反应…</div>;

  const question = challenge.questions[answers.length];
  return <div className="reaction-game">
    <div className="reaction-copy"><strong>第 <b>{answers.length + 1}</b> / {challenge.questions.length} 题</strong><div className="reaction-thumbs">{challenge.questions.map((item, index) => <img key={item.id} className={index === answers.length ? 'active' : ''} src={ASSETS[item.asset]} alt=""/>)}</div><span>本题情境</span><h3>{question.prompt}</h3></div>
    <img className="reaction-scene" src={ASSETS[question.asset]} alt="抽象奶蛙情境图"/>
    <div className="reaction-options">{question.options.map((option) => <button type="button" className="reaction-option" key={option.id} onClick={() => choose(question.id, option.id)}>{option.label}<Icon name="arrow" size={18}/></button>)}</div>
  </div>;
}

function AbstractCourt() {
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState('我家猫会说人话，只是不愿意当着你们的面说。');
  const [second, setSecond] = useState('昨天被外星人绑架了，所以消息没回。');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const judge = async () => {
    setBusy(true);
    trackProductEvent('lab_game_started', { game: 'court' });
    try {
      const payload = await postJson('/api/court', { participants: [{ name: '原告', mode: 'text', input: first }, { name: '被告', mode: 'text', input: second }] }, { signal: AbortSignal.timeout(10_000) });
      setResult(payload);
    } catch {
      const a = makeFallbackAssessment(first, 'text', []);
      const b = makeFallbackAssessment(second, 'text', []);
      const aScore = Math.round((a.score + a.nailoong.score) / 2);
      const bScore = Math.round((b.score + b.nailoong.score) / 2);
      setResult({ battle: { winner: Math.abs(aScore - bScore) <= 1 ? 'tie' : aScore > bScore ? 'A' : 'B', title: aScore === bScore ? '双方都很离谱' : `${aScore > bScore ? '原告' : '被告'}胜诉`, reason: '本庭依据嘴硬程度、抽象反应和临场发挥作出娱乐裁决。' }, participants: [a, b] });
    } finally {
      setBusy(false);
      trackProductEvent('lab_game_completed', { game: 'court' });
    }
  };

  return <section className={`lab-panel compact ${open ? 'open' : ''}`}>
    <button type="button" className="panel-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>02</span><strong>抽象法庭</strong><small>提交双方证词，判决谁更离谱</small><Icon name="scale"/></button>
    {open ? <div className="court-body"><div className="court-inputs"><label>原告证词<textarea value={first} onChange={(event) => setFirst(event.target.value)} /></label><b>VS</b><label>被告证词<textarea value={second} onChange={(event) => setSecond(event.target.value)} /></label></div><button type="button" className="yellow-button" disabled={busy || first.trim().length < 2 || second.trim().length < 2} onClick={judge}>{busy ? '正在开庭…' : '立即开庭'} <Icon name="scale"/></button>{result ? <div className="court-result"><strong>{result.battle.title}</strong><p>{result.battle.reason}</p></div> : null}<p className="privacy-line"><Icon name="lock" size={15}/> 原始证词只用于本次娱乐裁决，不进入好友榜。</p></div> : null}
  </section>;
}

function ToughTalkTranslator() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('今天有点累。');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const payload = await postJson('/api/quote', { input, mode: 'hao', level: '豪气冲天', style: '高冷' });
      setOutput(payload.output);
    } catch {
      setOutput(`不是累，只是有些事情，说了你们也不一定懂。`);
    } finally { setBusy(false); }
  };

  return <section id="tough-talk-translator" className={`lab-panel compact ${open ? 'open' : ''}`}><button type="button" className="panel-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>04</span><strong>嘴硬翻译器</strong><small>把普通话翻译成“我真没事”</small><Icon name="text"/></button>{open ? <div className="translator-body"><textarea aria-label="嘴硬翻译原句" value={input} onChange={(event) => setInput(event.target.value)} /><button type="button" className="primary-button" onClick={generate} disabled={busy}>{busy ? '翻译中…' : '开始嘴硬'}</button>{output ? <blockquote>{output}</blockquote> : null}</div> : null}</section>;
}

export function LabPage({ latestResult, onNavigate, onReactionComplete }) {
  return <main className="lab-page">
    <header className="lab-title"><div><h1>今天抽象点什么？</h1><p>没有标准答案，只有你的真实反应。</p></div><div className="persistent-score"><span>嘉豪 <b>{latestResult?.jiahao?.score ?? latestResult?.score ?? '--'}</b></span><span>奶龙 <b>{latestResult?.nailoong?.score ?? '--'}</b></span></div></header>
    <section className="lab-panel reaction-panel"><div className="panel-heading static"><span>01</span><strong>奶龙反应局</strong><small>正在进行</small><Icon name="flask"/></div><ReactionGame latestResult={latestResult} onReactionComplete={onReactionComplete}/></section>
    <AbstractCourt />
    <section className="lab-panel compact"><button type="button" className="panel-heading" onClick={() => onNavigate('friends')}><span>03</span><strong>好友整活房</strong><small>7天挑战赛 · 排名 · 轮换任务</small><Icon name="users"/></button></section>
    <ToughTalkTranslator />
    <section className="daily-task-card"><Icon name="archive"/><strong>今日任务：用一句话证明你嘴硬</strong><button type="button" onClick={() => { const panel = document.querySelector('#tough-talk-translator'); if (!panel?.classList.contains('open')) panel?.querySelector('button')?.click(); window.setTimeout(() => panel?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}>去完成 <Icon name="arrow"/></button></section>
  </main>;
}
