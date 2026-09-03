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
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [customBusy, setCustomBusy] = useState(false);
  const [customError, setCustomError] = useState('');

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

  const judgeCustom = async () => {
    const question = challenge?.questions[answers.length];
    const reaction = customInput.trim();
    if (!question || reaction.length < 2) return setCustomError('至少写两个字，AI 才知道怎么判。');
    setCustomBusy(true);
    setCustomError('');
    trackProductEvent('lab_game_started', { game: 'reaction_custom' });
    try {
      const payload = await postJson('/api/analyze', {
        mode: 'text',
        input: `情境：${question.prompt}\n我的真实反应：${reaction}`,
      });
      if (!payload?.nailoong) throw new Error('AI 暂时没判出来，请稍后再试。');
      const judged = {
        challengeId: `custom-${challenge.challengeId}`,
        custom: true,
        nailoong: payload.nailoong,
        highlight: { asset: question.asset, tone: 'AI 自定义判别', reaction },
      };
      setResult(judged);
      onReactionComplete(judged);
      trackProductEvent('lab_game_completed', { game: 'reaction_custom', outcome: payload.nailoong.archetype });
    } catch (nextError) {
      setCustomError(nextError.message || 'AI 暂时没判出来，请稍后再试。');
    } finally { setCustomBusy(false); }
  };

  if (error) return <div className="game-error" role="alert"><strong>题目走丢了</strong><p>刷新一下，再来一局。</p></div>;
  if (!challenge) return <div className="game-loading">正在翻找今天的抽象题目…</div>;
  if (result) return <div className="reaction-result"><div className="reaction-result-visual"><img src={ASSETS[result.highlight?.asset] || ASSETS.arms} alt="本局最抽象反应的奶蛙现场"/><span>{result.highlight?.tone}</span></div><div><span>{result.custom ? 'AI 判别奶龙指数' : '本局奶龙指数'}</span><strong>{result.nailoong.score}</strong><h3>{result.nailoong.archetype}</h3><p>{result.nailoong.verdict}</p>{result.highlight ? <blockquote><small>{result.custom ? '你的反应' : '本局高光'}</small>{result.highlight.reaction}</blockquote> : null}<button type="button" className="outline-button" onClick={() => { setAnswers([]); setResult(null); setLastReaction(null); setCustomInput(''); setCustomOpen(false); setRun((value) => (value + 1) % 3); }}>下一套题 <Icon name="reset"/></button><small className="reaction-deck-count">今天还有不同剧情，三套题轮着玩。</small></div></div>;
  if (busy || answers.length >= challenge.questions.length) return <div className="game-loading" aria-live="polite">正在汇总你的抽象反应…</div>;

  const question = challenge.questions[answers.length];
  return <div className="reaction-game">
    <div className="reaction-copy"><div className="reaction-progress" aria-label={`第 ${answers.length + 1} 题，共 ${challenge.questions.length} 题`}>{challenge.questions.map((item, index) => <i key={item.id} className={index <= answers.length ? 'active' : ''}/>)}</div><strong>第 {run + 1} 套 · {answers.length + 1} / {challenge.questions.length}</strong><h3>{question.prompt}</h3>{lastReaction ? <p className="reaction-flash" role="status"><b>{lastReaction.tone}</b>{lastReaction.text}</p> : null}</div>
    <figure className="reaction-scene"><img src={ASSETS[question.asset]} alt={`${question.prompt}的奶蛙情境图`}/><figcaption>轮到你接招</figcaption></figure>
    <div className="reaction-options">{question.options.map((option) => <button type="button" className="reaction-option" key={option.id} onClick={() => choose(question.id, option.id)}><span>{option.label}<small>{option.tone}</small></span><Icon name="arrow" size={18}/></button>)}</div>
    <div className={`reaction-custom ${customOpen ? 'open' : ''}`}>
      <button type="button" className="reaction-custom-toggle" aria-expanded={customOpen} onClick={() => { setCustomOpen((value) => !value); setCustomError(''); }}><span><b>写自己的反应</b><small>不选预设，让 AI 单独判这一招</small></span><Icon name={customOpen ? 'close' : 'spark'} size={18}/></button>
      {customOpen ? <div className="reaction-custom-form"><label htmlFor="custom-reaction">写下你的真实反应</label><textarea id="custom-reaction" maxLength={300} value={customInput} onChange={(event) => setCustomInput(event.target.value)} placeholder="例如：先沉默三秒，然后问大家要不要一起加班。"/><div><small>{customInput.length} / 300</small><button type="button" className="yellow-button" disabled={customBusy || customInput.trim().length < 2} onClick={judgeCustom}>{customBusy ? 'AI 正在判别…' : '交给 AI 判别'} <Icon name="spark" size={17}/></button></div>{customError ? <p className="form-message error" role="alert">{customError}</p> : null}<p className="privacy-line"><Icon name="lock" size={15}/> 文字只用于本次娱乐判别，不会加入公开榜单。</p></div> : null}
    </div>
  </div>;
}

function AbstractCourt({ open, onToggle }) {
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
    <button type="button" className="panel-heading" onClick={onToggle} aria-expanded={open}><strong>奶龙抽象法庭</strong><small>两句话，判谁的反应更离谱</small><Icon name="scale"/></button>
    {open ? <div className="court-body"><div className="court-inputs"><label>原告证词<textarea value={first} onChange={(event) => setFirst(event.target.value)} /></label><b>VS</b><label>被告证词<textarea value={second} onChange={(event) => setSecond(event.target.value)} /></label></div><button type="button" className="yellow-button" disabled={busy || first.trim().length < 2 || second.trim().length < 2} onClick={judge}>{busy ? '正在开庭…' : '立即开庭'} <Icon name="scale"/></button>{result ? <div className="court-result"><strong>{result.battle.title}</strong><p>{result.battle.reason}</p></div> : null}<p className="privacy-line"><Icon name="lock" size={15}/> 原始证词只用于本次娱乐裁决，不进入好友榜。</p></div> : null}
  </section>;
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

const STUDIO_CHARACTERS = {
  nailoong: {
    name: '奶龙', eyebrow: 'SOFT CHAOS', image: ASSETS.arms,
    prompt: '在雨夜撑伞等公交，神态平静得不合时宜',
    question: '想让奶龙出现在什么现场？',
  },
  jiahao: {
    name: '嘉豪', eyebrow: 'BLUE ATTITUDE', image: '/assets/jiahao/hao-universe-hero.webp',
    prompt: '在电蓝片场里回头，像刚说完一句懂的都懂',
    question: '想让嘉豪演一个什么场面？',
  },
};

const ACTIVE_STATES = new Set(['submitting', 'queued', 'running', 'finalizing']);
const STAGE_COPY = {
  submitting: ['提交中', '正在安全地送往创作引擎'],
  queued: ['排队中', '任务已接受，正在等待开拍'],
  running: ['创作中', '角色和场景正在成形'],
  finalizing: ['收尾中', '正在准备可播放的成片'],
};

function CharacterStudio({ mediaTask, mediaJob, onNavigate, open, onToggle }) {
  const [character, setCharacter] = useState('nailoong');
  const [mediaType, setMediaType] = useState('image');
  const [prompt, setPrompt] = useState(STUDIO_CHARACTERS.nailoong.prompt);
  const [scene, setScene] = useState('cinematic');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [quota, setQuota] = useState(null);
  const [quotaError, setQuotaError] = useState('');
  const result = mediaJob.result;
  const busy = ACTIVE_STATES.has(mediaJob.status);
  const selected = STUDIO_CHARACTERS[character];

  useEffect(() => {
    if (!open || mediaType !== 'video') return;
    let active = true;
    apiRequest('/api/videos/quota').then((value) => {
      if (active) { setQuota(value); setQuotaError(''); }
    }).catch((error) => {
      if (active) setQuotaError(error.message);
    });
    return () => { active = false; };
  }, [open, mediaType, mediaJob.status]);

  const chooseCharacter = (next) => {
    setCharacter(next);
    setPrompt(STUDIO_CHARACTERS[next].prompt);
  };

  const generate = async () => {
    trackProductEvent('lab_game_started', { game: mediaType });
    try {
      const payload = await mediaTask.start({ mediaType, character, prompt, scene, aspectRatio });
      if (mediaType === 'image') trackProductEvent('lab_game_completed', { game: 'image', outcome: payload.provider });
      if (payload.quota) setQuota(payload.quota);
    } catch { /* 全站任务栏会保留可重试状态 */ }
  };

  const imageSource = result?.imageDataUrl || result?.imageUrl;
  const outputCharacter = STUDIO_CHARACTERS[result?.character || mediaJob.character || character];
  const stage = STAGE_COPY[mediaJob.status];
  return <section id="character-studio" className={`lab-panel image-lab-panel character-studio character-${character} ${open ? 'open' : ''}`}>
    <button type="button" className="panel-heading" onClick={onToggle} aria-expanded={open}>
      <strong>角色创作室</strong><small>奶龙与嘉豪，图片和视频分开创作</small><Icon name="image"/>
    </button>
    {open ? <div className="image-lab-body">
      <div className="image-lab-controls">
        <div className="studio-kicker"><span>01 / 选择角色</span><b>{selected.eyebrow}</b></div>
        <div className="character-switch" role="group" aria-label="选择创作角色">{Object.entries(STUDIO_CHARACTERS).map(([id, item]) => <button type="button" key={id} aria-pressed={character === id} onClick={() => chooseCharacter(id)}><img src={item.image} alt=""/><span><b>{item.name}</b><small>{id === 'nailoong' ? '软萌荒诞主角' : '电蓝电影感主角'}</small></span></button>)}</div>
        <div className="studio-kicker"><span>02 / 选择媒介</span><b>{mediaType === 'video' ? '6 SEC MOTION' : 'STILL FRAME'}</b></div>
        <div className="media-switch" role="group" aria-label="选择图片或视频"><button type="button" aria-pressed={mediaType === 'image'} onClick={() => setMediaType('image')}><Icon name="image" size={18}/> 图片</button><button type="button" aria-pressed={mediaType === 'video'} onClick={() => setMediaType('video')}><Icon name="spark" size={18}/> 视频 <em>每日 1 次</em></button></div>
        <label className="image-prompt-label" htmlFor="character-media-prompt">03 / {selected.question}</label>
        <textarea id="character-media-prompt" value={prompt} maxLength={500} onChange={(event) => setPrompt(event.target.value)} />
        <fieldset className="image-choice-group"><legend>情境滤镜</legend><div>{IMAGE_SCENES.map((item) => <button type="button" key={item.id} aria-pressed={scene === item.id} onClick={() => setScene(item.id)}>{item.label}</button>)}</div></fieldset>
        <fieldset className="image-choice-group"><legend>画面比例</legend><div>{IMAGE_RATIOS.map((item) => <button type="button" key={item.id} aria-pressed={aspectRatio === item.id} onClick={() => setAspectRatio(item.id)}>{item.label}</button>)}</div></fieldset>
        {mediaType === 'video' ? <p className={`video-quota ${quota?.remaining === 0 ? 'empty' : ''}`}>{quotaError ? `额度暂时无法核验：${quotaError}` : quota ? `今日可用 ${quota.remaining} / ${quota.limit} · 上海时间零点重置` : '正在核验今日额度…'}</p> : null}
        {['failed', 'exhausted'].includes(mediaJob.status) ? <div className="form-message error" role="alert">{mediaJob.status === 'exhausted' ? '今天的视频额度已用完，已接受的任务仍会继续。' : mediaJob.message || '作品没有生成出来，换个友善的说法再试。'}</div> : null}
        <button type="button" className="yellow-button image-generate-button" disabled={busy || prompt.trim().length < 2 || (mediaType === 'video' && (quotaError || quota?.remaining === 0))} onClick={generate}>{busy ? `${outputCharacter.name}${mediaJob.mediaType === 'video' ? '视频' : '图片'}正在创作` : `生成${selected.name}${mediaType === 'video' ? '视频' : '图片'}`} <Icon name={mediaType === 'video' ? 'spark' : 'image'}/></button>
        <p className="privacy-line"><Icon name="lock" size={15}/> {mediaType === 'video' ? '视频为 768P、6 秒并带 AI 水印；' : 'AI 生成内容会带水印；'}不保存你的描述或生成内容。</p>
      </div>
      <div className="image-lab-output" aria-live="polite">
        {busy && stage ? <div className="image-generating studio-waiting" data-character={mediaJob.character}><span>{stage[0]}</span><img src={outputCharacter.image} alt={`${outputCharacter.name}创作中`}/><strong>{stage[1]}</strong><p>没有虚构进度条。你可以继续浏览，右下角会保留真实阶段。</p><div><button type="button" className="outline-button" onClick={() => onNavigate('assay')}>去做鉴定</button><button type="button" className="outline-button" onClick={() => onNavigate('friends')}>去好友房</button></div></div> : mediaJob.status === 'succeeded' && result?.mediaType === 'video' && result.videoUrl ? <figure className="image-result-figure video-result-figure" data-ratio={result.aspectRatio}><video src={result.videoUrl} controls preload="metadata" aria-label={`生成的${outputCharacter.name}视频`}/><figcaption><strong>{outputCharacter.name}开拍完成。</strong><a className="outline-button" href={result.videoUrl} download={`${outputCharacter.name}视频-${result.id}.mp4`}>下载视频 <Icon name="download" size={18}/></a></figcaption></figure> : mediaJob.status === 'succeeded' && imageSource ? <figure className="image-result-figure" data-ratio={result.aspectRatio}>
          <img src={imageSource} alt={`生成的${outputCharacter.name}场景`}/>
          <figcaption><strong>{outputCharacter.name}图片已完成。</strong><a className="outline-button" href={imageSource} download={`${outputCharacter.name}创作-${result.id || 'image'}.jpg`}>下载图片 <Icon name="download" size={18}/></a></figcaption>
        </figure> : <div className="image-empty studio-preview" data-character={character}><span className="preview-label">{selected.eyebrow}</span><img src={selected.image} alt={`等待创作的${selected.name}`}/><strong>{selected.name} × {mediaType === 'video' ? '动态画面' : '静态画面'}</strong><span>选好角色和媒介<br/>一句话开始创作</span></div>}
      </div>
    </div> : null}
  </section>;
}

export function LabPage({ latestResult, onNavigate, onReactionComplete, mediaTask, mediaJob }) {
  const [activeTool, setActiveTool] = useState('studio');

  useEffect(() => {
    if (mediaJob.status !== 'idle') setActiveTool('studio');
  }, [mediaJob.status]);

  const toggleTool = (tool) => setActiveTool((current) => current === tool ? '' : tool);

  return <main className="lab-page">
    <header className="lab-title"><div><h1>奶龙实验室</h1><p>这里单独玩奶龙。五道题，看你的真实反应。</p></div>{latestResult?.nailoong ? <div className="persistent-score"><span>上次奶龙指数 <b>{latestResult.nailoong.score}</b></span></div> : null}</header>
    <CharacterStudio mediaTask={mediaTask} mediaJob={mediaJob} onNavigate={onNavigate} open={activeTool === 'studio'} onToggle={() => toggleTool('studio')}/>
    <section className="lab-panel reaction-panel"><div className="panel-heading static"><strong>奶龙反应局</strong><small>五道题，看看你会怎么接</small><Icon name="flask"/></div><ReactionGame onReactionComplete={onReactionComplete}/></section>
    <section className="lab-tool-rail" aria-label="更多奶龙玩法"><AbstractCourt open={activeTool === 'court'} onToggle={() => toggleTool('court')}/><section className="lab-panel compact"><button type="button" className="panel-heading" onClick={() => onNavigate('friends')}><strong>好友整活房</strong><small>叫上朋友一起玩</small><Icon name="users"/></button></section></section>
  </main>;
}
