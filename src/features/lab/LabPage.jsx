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
  snack: '/assets/nailoong/snack.webp',
  ktv: '/assets/nailoong/ktv.webp',
  'video-call': '/assets/nailoong/video-call.webp',
  elevator: '/assets/nailoong/elevator.webp',
};

function ReactionGame({ onReactionComplete }) {
  const [run, setRun] = useState(0);
  const [challenge, setChallenge] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const [lastReaction, setLastReaction] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setChallenge(null);
    setError('');
    apiRequest(`/api/reactions/daily?date=${todayInShanghai()}&run=${run}`)
      .then((payload) => active && setChallenge(payload))
      .catch((nextError) => active && setError(nextError.message));
    return () => { active = false; };
  }, [run]);

  const choose = async (questionId, optionId) => {
    if (!challenge || busy) return;
    if (!answers.length) trackProductEvent('lab_game_started', { game: 'reaction' });
    const selected = challenge.questions[answers.length]?.options.find((option) => option.id === optionId);
    setLastReaction(selected ? { tone: selected.tone, text: selected.reaction } : null);
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

  if (error) return <div className="game-error" role="alert"><strong>题目走丢了</strong><p>刷新一下，再来一局。</p></div>;
  if (!challenge) return <div className="game-loading">正在翻找今天的抽象题目…</div>;
  if (result) return <div className="reaction-result"><div className="reaction-result-visual"><img src={ASSETS[result.highlight?.asset] || ASSETS.arms} alt="本局最抽象反应的奶蛙现场"/><span>{result.highlight?.tone}</span></div><div><span>本局奶龙指数</span><strong>{result.nailoong.score}</strong><h3>{result.nailoong.archetype}</h3><p>{result.nailoong.verdict}</p>{result.highlight ? <blockquote><small>本局高光</small>{result.highlight.reaction}</blockquote> : null}<button type="button" className="outline-button" onClick={() => { setAnswers([]); setResult(null); setLastReaction(null); setRun((value) => (value + 1) % 3); }}>下一套题 <Icon name="reset"/></button><small className="reaction-deck-count">今天还有不同剧情，三套题轮着玩。</small></div></div>;
  if (busy || answers.length >= challenge.questions.length) return <div className="game-loading" aria-live="polite">正在汇总你的抽象反应…</div>;

  const question = challenge.questions[answers.length];
  return <div className="reaction-game">
    <div className="reaction-copy"><div className="reaction-progress" aria-label={`第 ${answers.length + 1} 题，共 ${challenge.questions.length} 题`}>{challenge.questions.map((item, index) => <i key={item.id} className={index <= answers.length ? 'active' : ''}/>)}</div><strong>第 {run + 1} 套 · {answers.length + 1} / {challenge.questions.length}</strong><h3>{question.prompt}</h3>{lastReaction ? <p className="reaction-flash" role="status"><b>{lastReaction.tone}</b>{lastReaction.text}</p> : null}</div>
    <figure className="reaction-scene"><img src={ASSETS[question.asset]} alt={`${question.prompt}的奶蛙情境图`}/><figcaption>轮到你接招</figcaption></figure>
    <div className="reaction-options">{question.options.map((option) => <button type="button" className="reaction-option" key={option.id} onClick={() => choose(question.id, option.id)}><span>{option.label}<small>{option.tone}</small></span><Icon name="arrow" size={18}/></button>)}</div>
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
    <button type="button" className="panel-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}><strong>抽象法庭</strong><small>两句话，判谁更离谱</small><Icon name="scale"/></button>
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

  return <section id="tough-talk-translator" className={`lab-panel compact ${open ? 'open' : ''}`}><button type="button" className="panel-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}><strong>嘴硬翻译器</strong><small>把普通话翻译成“我真没事”</small><Icon name="text"/></button>{open ? <div className="translator-body"><textarea aria-label="嘴硬翻译原句" value={input} onChange={(event) => setInput(event.target.value)} /><button type="button" className="primary-button" onClick={generate} disabled={busy}>{busy ? '翻译中…' : '开始嘴硬'}</button>{output ? <blockquote>{output}</blockquote> : null}</div> : null}</section>;
}

const IMAGE_SCENES = [
  { id: 'cinematic', label: '雨夜电影' },
  { id: 'editorial', label: '暖白档案' },
  { id: 'prank', label: '朋友整活' },
  { id: 'awkward', label: '社死现场' },
];
const IMAGE_RATIOS = [
  { id: '1:1', label: '方图 1:1' },
  { id: '3:4', label: '竖版 3:4' },
  { id: '16:9', label: '横版 16:9' },
];

function AbstractImageGame() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('在雨夜撑伞等公交，神态平静得不合时宜');
  const [scene, setScene] = useState('cinematic');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    trackProductEvent('lab_game_started', { game: 'image' });
    try {
      const payload = await postJson('/api/images/generate', { prompt, scene, aspectRatio }, { signal: AbortSignal.timeout(100_000) });
      setResult(payload);
      trackProductEvent('lab_game_completed', { game: 'image', outcome: payload.provider });
    } catch (nextError) {
      setError('这张图没生成出来，换个说法再试一次。');
    } finally {
      setBusy(false);
    }
  };

  const imageSource = result?.imageDataUrl || result?.imageUrl;
  return <section className={`lab-panel image-lab-panel ${open ? 'open' : ''}`}>
    <button type="button" className="panel-heading" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <strong>奶蛙生图局</strong><small>把离谱脑洞变成现场</small><Icon name="image"/>
    </button>
    {open ? <div className="image-lab-body">
      <div className="image-lab-controls">
        <label className="image-prompt-label" htmlFor="abstract-image-prompt">你想让奶蛙干什么？</label>
        <textarea id="abstract-image-prompt" value={prompt} maxLength={500} onChange={(event) => setPrompt(event.target.value)} />
        <fieldset className="image-choice-group"><legend>情境滤镜</legend><div>{IMAGE_SCENES.map((item) => <button type="button" key={item.id} aria-pressed={scene === item.id} onClick={() => setScene(item.id)}>{item.label}</button>)}</div></fieldset>
        <fieldset className="image-choice-group"><legend>画面比例</legend><div>{IMAGE_RATIOS.map((item) => <button type="button" key={item.id} aria-pressed={aspectRatio === item.id} onClick={() => setAspectRatio(item.id)}>{item.label}</button>)}</div></fieldset>
        {error ? <div className="form-message error" role="alert">{error}</div> : null}
        <button type="button" className="yellow-button image-generate-button" disabled={busy || prompt.trim().length < 2} onClick={generate}>{busy ? '奶蛙正在赶来…' : '生成抽象现场'} <Icon name="image"/></button>
        <p className="privacy-line"><Icon name="lock" size={15}/> 这是生成图，别当真；描述和图片不会保存。</p>
      </div>
      <div className="image-lab-output" aria-live="polite">
        {busy ? <div className="image-generating"><strong>奶蛙赶来中…</strong><p>这张图要现搓，稍等一下。</p></div> : imageSource ? <figure className="image-result-figure" data-ratio={result.aspectRatio}>
          <img src={imageSource} alt="生成的抽象奶蛙场景"/>
          <figcaption><strong>图好了，拿去整活。</strong><a className="outline-button" href={imageSource} download={`奶蛙抽象现场-${result.id || 'image'}.jpg`}>下载图片 <Icon name="download" size={18}/></a></figcaption>
        </figure> : <div className="image-empty"><img src={ASSETS.umbrella} alt="等待生成的抽象奶蛙"/><span>把一个不合时宜的场面<br/>交给奶蛙来演</span></div>}
      </div>
    </div> : null}
  </section>;
}

export function LabPage({ latestResult, onNavigate, onReactionComplete }) {
  return <main className="lab-page">
    <header className="lab-title"><div><h1>今天抽象点什么？</h1><p>没有标准答案，只有你的真实反应。</p></div>{latestResult ? <div className="persistent-score"><span>嘉豪 <b>{latestResult.jiahao?.score ?? latestResult.score}</b></span><span>奶龙 <b>{latestResult.nailoong?.score}</b></span></div> : null}</header>
    <section className="lab-panel reaction-panel"><div className="panel-heading static"><strong>奶龙反应局</strong><small>五道题，看看你会怎么接</small><Icon name="flask"/></div><ReactionGame onReactionComplete={onReactionComplete}/></section>
    <AbstractCourt />
    <section className="lab-panel compact"><button type="button" className="panel-heading" onClick={() => onNavigate('friends')}><strong>好友整活房</strong><small>叫上朋友一起玩</small><Icon name="users"/></button></section>
    <ToughTalkTranslator />
    <AbstractImageGame />
  </main>;
}
