import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

const SITE_URL = 'https://jiahao.versecraft.cn';

const MODES = [
  { id: 'text', label: '文字鉴定', hint: '输入朋友圈文案、签名或你想说的一句话' },
  { id: 'photo', label: '照片鉴定', hint: '上传一张最有感觉的照片' },
  { id: 'chat', label: '聊天记录', hint: '上传 1–3 张聊天截图，记得先隐藏隐私' },
];

const SPECIES = [
  { name: '自在极意豪', en: '极意形态', asset: '/assets/jiahao-species-blue.png', crop: '0% center', summary: '豪气自行运转，万物皆可成为舞台。', clue: '黑口罩、苹果耳机、低头侧脸；越不解释越有戏。' },
  { name: '美式嘉豪', en: '潮流形态', asset: '/assets/jiahao-species-blue.png', crop: '50% center', summary: '墨镜一戴，自以为很潮的松弛感开始接管画面。', clue: '棒球夹克、冰美式，走两步就像在拍音乐短片。' },
  { name: '深情破碎豪', en: '深夜形态', asset: '/assets/jiahao-species-blue.png', crop: '100% center', summary: '嘴上说无所谓，歌单已经循环八遍。', clue: '深夜、侧脸，以及没发出去的长文。' },
  { name: '计算机嘉豪', en: '终端形态', asset: '/assets/jiahao-species-labs.png', crop: '0% center', summary: '终端常驻，配置单和键盘轴体张口就来。', clue: '不一定在写代码，但一定在讲底层。' },
  { name: '股票嘉豪', en: '行情形态', asset: '/assets/jiahao-species-labs.png', crop: '50% center', summary: '行情线一开口，宏观叙事自动生成。', clue: '涨了“早就说了”，跌了“长期价值”。' },
  { name: '不懂装懂豪', en: '抽象形态', asset: '/assets/jiahao-species-labs.png', crop: '100% center', summary: '术语密度拉满，细问就是底层逻辑。', clue: '闭环、赋能、认知差，主打一个语义防御。' },
  { name: '小众优越豪', en: '冷门形态', asset: '/assets/jiahao-species-blue.png', crop: '50% center', summary: '不是冷门，只是你们暂时还没听懂。', clue: '越不解释，越等待别人追问。' },
  { name: '潜伏嘉豪', en: '静默形态', asset: '/assets/jiahao-species-blue.png', crop: '100% center', summary: '表面风平浪静，细节里全是豪气伏笔。', clue: '一句“随便”里藏着十八层构图。' },
  { name: '反向嘉豪', en: '反向形态', asset: '/assets/jiahao-species-blue.png', crop: '0% center', summary: '越是否认自己嘉豪，豪气越难以隐藏。', clue: '我真没装——通常是最响的前奏。' },
];

const DIMENSION_META = [
  ['mystery', '神秘感'],
  ['flex', '无意炫耀'],
  ['niche', '小众优越'],
  ['deep', '深情浓度'],
  ['show', '镜头掌控'],
  ['language', '豪言匹配'],
];

const ANALYSIS_STEPS = [
  '正在捕捉潜在豪气……',
  '正在识别无意式炫耀……',
  '正在测量深夜深情浓度……',
  '正在比对嘉豪物种图谱……',
  '豪气正在汇聚……',
];

const EXAMPLES = [
  '也没什么，只是一个人习惯了。',
  '这个框架底层逻辑其实不复杂，我一般直接在终端里跑。',
  '这波回调很正常，我看的是长期价值和仓位管理。',
  '不是不会解释，主要这个涉及认知闭环，你懂的。',
];

function Icon({ name, size = 20 }) {
  const paths = {
    arrow: <><path d="M4 12h15"/><path d="m14 5 7 7-7 7"/></>,
    text: <><path d="M4 6h16"/><path d="M12 6v14"/><path d="M8 20h8"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
    download: <><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></>,
    reset: <><path d="M4 7v5h5"/><path d="M5.7 16a8 8 0 1 0 .3-9L4 12"/></>,
    close: <><path d="m5 5 14 14M19 5 5 19"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">{paths[name]}</svg>;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function clamp(n, min = 8, max = 99) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function analyze(input, mode, files) {
  const raw = mode === 'text' ? input.trim() : files.map((file) => `${file.name}-${file.size}`).join('|');
  const seed = hashString(`${mode}:${raw || 'jiahao'}`);
  const jitter = (shift) => ((seed >> shift) % 17) - 8;
  const has = (pattern) => pattern.test(raw);
  const base = 54 + (seed % 14);

  const dimensions = {
    mystery: clamp(base + jitter(1) + (has(/黑|夜|口罩|不想|侧脸|冷|无所谓/) ? 18 : 0)),
    flex: clamp(base + jitter(3) + (has(/车|方向盘|价格|只是|刚好|随手|不是故意|落地/) ? 23 : 0)),
    niche: clamp(base + jitter(5) + (has(/小众|冷门|你们不懂|知道的人|地下|主流/) ? 25 : 0)),
    deep: clamp(base + jitter(7) + (has(/一个人|习惯|深夜|无所谓|失望|算了|没事|想你/) ? 26 : 0)),
    show: clamp(base + jitter(9) + (mode !== 'text' ? 20 : 0) + (has(/镜头|拍|看我|照片/) ? 15 : 0)),
    language: clamp(base + jitter(11) + (has(/你记住|反正|懂吧|我也没说|可能你们|别多想|只是|底层逻辑|赋能|闭环/) ? 25 : 0)),
  };

  const weighted = dimensions.mystery * 0.2 + dimensions.flex * 0.2 + dimensions.niche * 0.2 + dimensions.deep * 0.15 + dimensions.show * 0.15 + dimensions.language * 0.1;
  const score = clamp(weighted + (seed % 4), 12, 100);
  const sorted = DIMENSION_META.map(([key, label]) => ({ key, label, value: dimensions[key] })).sort((a, b) => b.value - a.value);

  let level = '嘉豪观察对象';
  let verdict = '你的豪气刚刚苏醒，偶尔会出现一些不经意的嘉豪行为。';
  if (score >= 95) [level, verdict] = ['自在极意豪', '豪气自行运转，万物皆可成为你的舞台。'];
  else if (score >= 80) [level, verdict] = ['豪气冲天', '你的豪气已经突破屏幕，普通镜头很难承载这份豪意。'];
  else if (score >= 60) [level, verdict] = ['高阶嘉豪', '你试图把豪气藏进日常，但每个细节都在替你发言。'];
  else if (score >= 40) [level, verdict] = ['半步嘉豪', '豪气正在加载，偶尔已经能听见引擎声。'];
  else [level, verdict] = ['清澈普通人', '气息过于正常，建议先观察，不要急着修炼。'];

  let type = '潜伏嘉豪';
  if (score >= 95) type = '自在极意豪';
  else if (has(/代码|编程|程序|计算机|电脑|终端|命令行|框架|键盘|配置|服务器|算法|bug/i)) type = '计算机嘉豪';
  else if (has(/股票|基金|K线|仓位|抄底|牛市|熊市|回调|价值投资|大盘|宏观|涨停/)) type = '股票嘉豪';
  else if (has(/底层逻辑|闭环|赋能|认知差|方法论|抓手|对齐|颗粒度|这个你不懂|你懂的/)) type = '不懂装懂豪';
  else if (has(/美式|咖啡|落地|墨镜|夹克|方向盘|公路|潮流|MV/i)) type = '美式嘉豪';
  else if (sorted[0].key === 'deep') type = '深情破碎豪';
  else if (sorted[0].key === 'niche') type = '小众优越豪';
  else if (score < 40) type = '反向嘉豪';
  else if (sorted[0].key === 'flex') type = '无意炫耀豪';

  const evidenceMap = {
    mystery: '信息留白面积很大，给“你们最好主动来问”留下充分空间。',
    flex: '表面像随手一提，关键元素却都稳稳进入了叙事中心。',
    niche: '内容出现“懂的人自然懂”式身份暗号，小众雷达明显波动。',
    deep: '克制表达与情绪余震同时出现，深夜浓度已超过建议值。',
    show: '构图意识强，哪怕没有镜头，语言也会自动寻找最佳机位。',
    language: '经典否定式强调结构被捕获：越说没什么，越像有什么。',
  };

  const traitMap = {
    自在极意豪: ['黑口罩', '苹果耳机', '低头侧脸', '拒绝解释'],
    美式嘉豪: ['墨镜常驻', '自以为很潮', '冰美式', '潮流步态'],
    深情破碎豪: ['深夜在线', '嘴硬心软', '歌单循环', '侧脸叙事'],
    计算机嘉豪: ['终端常驻', '配置敏感', '轴体研究', '底层爱好者'],
    股票嘉豪: ['K 线凝视', '宏观叙事', '仓位管理', '事后先知'],
    不懂装懂豪: ['术语连发', '底层逻辑', '认知闭环', '细问转场'],
    小众优越豪: ['冷门雷达', '懂的都懂', '拒绝主流', '等待追问'],
    潜伏嘉豪: ['表面正常', '细节埋点', '随手构图', '静默蓄力'],
    反向嘉豪: ['持续否认', '越描越豪', '普通伪装', '反向确认'],
    无意炫耀豪: ['随手露出', '否定强调', '构图精准', '等待发现'],
  };

  return {
    id: `嘉豪-${String(seed).slice(0, 8).padStart(8, '0')}`,
    score,
    level,
    verdict,
    type,
    traits: traitMap[type] || ['神秘感', '不经意', '等待追问', '稳定发挥'],
    dimensions,
    top: sorted.slice(0, 3),
    evidence: sorted.slice(0, 3).map((item) => evidenceMap[item.key]),
    comment: `你并没有主动展示豪气，但${sorted[0].label}已经从内容边缘自然溢出。${sorted[1].label}与${sorted[2].label}完成闭环，最终呈现为“${type}”。建议保持现状，再刻意一点可能就不自然了。`,
    createdAt: Date.now(),
    mode,
  };
}

function Radar({ dimensions, compact = false }) {
  const size = compact ? 170 : 250;
  const center = size / 2;
  const radius = size * 0.36;
  const values = DIMENSION_META.map(([key]) => dimensions[key]);
  const point = (index, value = 100) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
    const r = radius * (value / 100);
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  };
  return (
    <svg className="radar" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="六维豪气雷达图">
      {[25, 50, 75, 100].map((tick) => <polygon key={tick} points={values.map((_, i) => point(i, tick)).join(' ')} fill="none" stroke="currentColor" opacity={tick === 100 ? 0.7 : 0.18} />)}
      {values.map((_, i) => <line key={i} x1={center} y1={center} x2={point(i).split(',')[0]} y2={point(i).split(',')[1]} stroke="currentColor" opacity=".25" />)}
      <polygon points={values.map((v, i) => point(i, v)).join(' ')} fill="var(--signal)" fillOpacity=".2" stroke="var(--signal)" strokeWidth="3" />
      {values.map((v, i) => { const [cx, cy] = point(i, v).split(','); return <circle key={i} cx={cx} cy={cy} r="4" fill="var(--paper)" stroke="var(--signal)" strokeWidth="2" />; })}
    </svg>
  );
}

function AnimatedNumber({ value }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const duration = 1000;
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      setCurrent(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return current;
}

function useHistory() {
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jiahao-history')) || []; } catch { return []; }
  });
  const add = (result) => {
    const next = [result, ...history].slice(0, 6);
    setHistory(next);
    try { localStorage.setItem('jiahao-history', JSON.stringify(next)); } catch { /* storage may be disabled */ }
  };
  const clear = () => {
    setHistory([]);
    try { localStorage.removeItem('jiahao-history'); } catch { /* storage may be disabled */ }
  };
  return { history, add, clear };
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const chars = [...text];
  const lines = [];
  let line = '';
  chars.forEach((char) => {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = char; } else line = test;
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
}

async function makePoster(result) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070b12';
  ctx.fillRect(0, 0, 1080, 1440);
  ctx.strokeStyle = '#2f7bff';
  ctx.lineWidth = 16;
  ctx.strokeRect(24, 24, 1032, 1392);

  const species = SPECIES.find((item) => item.name === result.type) || SPECIES[0];
  const img = new Image();
  img.src = species.asset;
  await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
  if (img.complete && img.naturalWidth) {
    const crop = species.crop.startsWith('100') ? 2 : species.crop.startsWith('50') ? 1 : 0;
    const sx = img.naturalWidth / 3 * crop;
    ctx.save();
    ctx.beginPath();
    ctx.rect(612, 150, 380, 580);
    ctx.clip();
    ctx.drawImage(img, sx, 0, img.naturalWidth / 3, img.naturalHeight, 612, 150, 380, 580);
    ctx.restore();
  }

  ctx.fillStyle = '#eaf2ff';
  ctx.font = '900 62px Arial, sans-serif';
  ctx.fillText('嘉豪鉴定所', 78, 120);
  ctx.font = '600 22px monospace';
  ctx.fillText(`鉴定编号 / ${result.id}`, 78, 160);
  ctx.fillStyle = '#2f7bff';
  ctx.font = '900 280px Arial, sans-serif';
  ctx.fillText(String(result.score).padStart(2, '0'), 64, 480);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillText('/ 100  嘉豪指数', 90, 532);
  ctx.fillStyle = '#2f7bff';
  ctx.fillRect(72, 584, 486, 9);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '900 84px Arial, sans-serif';
  drawWrappedText(ctx, result.type, 72, 686, 500, 92, 2);

  ctx.fillStyle = '#eaf2ff';
  ctx.fillRect(72, 770, 936, 4);
  ctx.font = '700 28px Arial, sans-serif';
  ctx.fillText('豪气成分 / 前三项', 72, 826);
  result.top.forEach((item, index) => {
    const y = 880 + index * 72;
    ctx.font = '700 32px Arial, sans-serif';
    ctx.fillText(`0${index + 1}  ${item.label}`, 72, y);
    ctx.fillStyle = '#2f7bff';
    ctx.fillRect(360, y - 25, item.value * 5.4, 24);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = '800 28px monospace';
    ctx.fillText(String(item.value), 930, y);
  });

  ctx.fillRect(72, 1090, 936, 4);
  ctx.fillStyle = '#73d7ff';
  ctx.font = '900 34px Arial, sans-serif';
  drawWrappedText(ctx, result.verdict, 72, 1150, 690, 46, 3);
  const qr = await QRCode.toDataURL(SITE_URL, { margin: 0, width: 150, color: { dark: '#eaf2ff', light: '#070b12' } });
  const qrImg = new Image();
  qrImg.src = qr;
  await new Promise((resolve) => { qrImg.onload = resolve; });
  ctx.drawImage(qrImg, 840, 1130, 150, 150);
  ctx.fillStyle = '#eaf2ff';
  ctx.font = '600 20px monospace';
  ctx.fillText('长按扫码，再鉴定一个', 754, 1318);
  ctx.fillText('结果仅供娱乐 · 不上传内容', 72, 1360);
  return canvas.toDataURL('image/png');
}

function Header({ onHistory }) {
  return (
    <header className="site-header">
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="返回首页"><span>嘉豪</span>鉴定所</button>
      <nav aria-label="主导航">
        <a href="#species">嘉豪图鉴</a>
        <button onClick={onHistory}>鉴定记录</button>
      </nav>
      <a className="header-cta" href="#assay">开始鉴定 <Icon name="arrow" size={18} /></a>
    </header>
  );
}

function AssayForm({ onResult, addHistory }) {
  const [mode, setMode] = useState('text');
  const [input, setInput] = useState(EXAMPLES[0]);
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [step, setStep] = useState(0);
  const fileRef = useRef(null);

  const selectMode = (next) => { setMode(next); setError(''); setFiles([]); };
  const onFiles = (list) => {
    const accepted = [...list].filter((file) => /image\/(jpeg|png|webp)/.test(file.type) && file.size <= 10 * 1024 * 1024);
    const limit = mode === 'chat' ? 3 : 1;
    if (!accepted.length) setError('请上传十兆以内的常见图片格式。');
    else { setFiles(accepted.slice(0, limit)); setError(''); }
  };

  const start = () => {
    if (!consent) return setError('请先确认内容使用权限与娱乐分析说明。');
    if (mode === 'text' && input.trim().length < 5) return setError('至少输入 5 个字，豪气才有迹可循。');
    if (mode !== 'text' && files.length === 0) return setError('先上传素材，鉴定仪还不能隔空捕捉豪气。');
    setError('');
    setAnalyzing(true);
    setStep(0);
    const timer = window.setInterval(() => setStep((value) => Math.min(value + 1, ANALYSIS_STEPS.length - 1)), 520);
    window.setTimeout(() => {
      window.clearInterval(timer);
      const result = analyze(input, mode, files);
      addHistory(result);
      setAnalyzing(false);
      onResult(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 2850);
  };

  return (
    <div className="assay-frame" id="assay">
      <div className="mode-tabs" role="tablist" aria-label="鉴定方式">
        {MODES.map((item) => (
          <button key={item.id} role="tab" aria-selected={mode === item.id} className={mode === item.id ? 'active' : ''} onClick={() => selectMode(item.id)}>
            <Icon name={item.id === 'text' ? 'text' : item.id === 'photo' ? 'image' : 'chat'} size={19} />{item.label}
          </button>
        ))}
      </div>
      <div className="input-area">
        {mode === 'text' ? (
          <>
            <label htmlFor="jiahao-text">输入一句最有感觉的话</label>
            <textarea id="jiahao-text" maxLength={500} value={input} onChange={(event) => setInput(event.target.value)} />
            <span className="counter">{input.length} / 500</span>
            <div className="example-row" aria-label="换一个示例">
              <span>试试：</span>
              {EXAMPLES.slice(1).map((example, index) => <button key={example} onClick={() => setInput(example)}>0{index + 1}</button>)}
            </div>
          </>
        ) : (
          <button className="drop-zone" onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onFiles(event.dataTransfer.files); }}>
            <Icon name="upload" size={30} />
            <strong>{files.length ? `已捕获 ${files.length} 份豪气素材` : MODES.find((item) => item.id === mode).hint}</strong>
            <span>{files.length ? files.map((file) => file.name).join(' / ') : '点击选择或拖到这里 · 常见图片格式 · 十兆以内'}</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={mode === 'chat'} hidden onChange={(event) => onFiles(event.target.files)} />
      </div>
      <label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><Icon name="check" size={15} /></span>我确认拥有内容使用权限；由本地娱乐算法分析，不会上传。</label>
      {error && <p className="form-error" role="alert">鉴定中止 / {error}</p>}
      <button className="primary-action" onClick={start} disabled={analyzing}>{analyzing ? ANALYSIS_STEPS[step] : <>开始鉴定 <Icon name="arrow" size={26} /></>}</button>
      {analyzing && <span className="sr-only" role="status" aria-live="polite">{ANALYSIS_STEPS[step]}</span>}
      {analyzing && <div className="analysis-progress" aria-hidden="true"><span style={{ width: `${(step + 1) * 20}%` }} /></div>}
    </div>
  );
}

function Scale() {
  return <div className="scale"><div className="scale-head"><strong>豪气刻度</strong><span>普通人</span><span>自在极意豪</span></div><div className="scale-line">{Array.from({ length: 11 }, (_, i) => <i key={i} className={i > 6 ? 'hot' : ''}><b>{i * 10}</b></i>)}</div></div>;
}

function Home({ onResult, addHistory }) {
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="scan-marker" aria-hidden="true">豪气目标 // 已锁定</div>
          <h1>你身上，<br />到底有多少豪气？</h1>
          <p>输入一句话，鉴定你的嘉豪浓度、物种与隐藏天赋。</p>
        </div>
        <div className="hero-scan" aria-hidden="true"><span>豪气波形<br />锁定中……</span><i /></div>
        <AssayForm onResult={onResult} addHistory={addHistory} />
        <Scale />
        <div className="document-meta"><span>娱乐档案<br /><b>仅供鉴定娱乐使用</b></span><span className="barcode" /><span>嘉豪鉴定样本<br /><b>请勿过度当真</b></span></div>
      </section>
      <SpeciesGallery />
      <section className="how-it-works">
        <div><small>第一步 / 输入</small><strong>投喂一句豪言</strong><p>照片、聊天截图或一句不经意的话，都能成为证据。</p></div>
        <div><small>第二步 / 鉴定</small><strong>六维捕获豪气</strong><p>神秘、炫耀、小众、深情、镜头感与豪言同时扫描。</p></div>
        <div><small>第三步 / 传播</small><strong>生成鉴定海报</strong><p>带着你的分数、物种与判词，去群聊里接受复核。</p></div>
      </section>
    </main>
  );
}

function SpeciesGallery({ selected }) {
  const [active, setActive] = useState(selected || 0);
  const item = SPECIES[active];
  return (
    <section className="species-section" id="species">
      <div className="section-number">物种档案 / 九种</div>
      <div className="species-title"><h2>嘉豪物种图鉴</h2><p>同一种豪气，也有不同的进化路线。<br />滑动档案，认领你的精神分支。</p></div>
      <div className="species-stage">
        <div className="species-portrait" style={{ backgroundImage: `url(${item.asset})`, backgroundPosition: item.crop }}><span>{String(active + 1).padStart(2, '0')}</span></div>
        <div className="species-detail">
          <small>{item.en}</small><h3>{item.name}</h3><p>{item.summary}</p><blockquote>“{item.clue}”</blockquote>
          <div className="species-switcher">{SPECIES.map((species, index) => <button key={species.name} onClick={() => setActive(index)} aria-label={`查看${species.name}`} aria-current={index === active}>{String(index + 1).padStart(2, '0')}</button>)}</div>
        </div>
      </div>
    </section>
  );
}

function Result({ result, onReset, onPoster }) {
  const speciesIndex = Math.max(0, SPECIES.findIndex((item) => item.name === result.type));
  return (
    <main className="result-page">
      <section className="result-hero">
        <div className="result-heading"><span className="completion-mark">/// 鉴定完成</span><button className="secondary-action top-reset" onClick={onReset}>再测一次 <Icon name="reset" size={18} /></button></div>
        <div className="result-grid">
          <div className="score-block"><small>嘉豪指数</small><div className="score"><AnimatedNumber value={result.score} /><em>/100</em></div><div className="approval-stamp">鉴定通过</div><small>嘉豪物种</small><h1>{result.type}</h1><div className="verdict"><span>鉴定结论</span><strong>{result.verdict}</strong></div><div className="trait-signals" aria-label="捕获到的嘉豪特征">{(result.traits || ['信号稳定', '豪气待复核']).map((trait) => <span key={trait}>{trait}</span>)}</div></div>
          <div className="dimension-block"><h2>六维豪气分析</h2><Radar dimensions={result.dimensions} />
            <div className="dimension-list">{DIMENSION_META.map(([key, label]) => <div key={key}><span>{label}</span><i><b style={{ width: `${result.dimensions[key]}%` }} /></i><strong>{result.dimensions[key]}</strong></div>)}</div>
          </div>
          <aside className="share-preview">
            <div className="poster-mini"><span className="poster-title">嘉豪鉴定所</span><div className="poster-image" style={{ backgroundImage: `url(${SPECIES[speciesIndex]?.asset || SPECIES[0].asset})`, backgroundPosition: SPECIES[speciesIndex]?.crop || '0 center' }} /><small>{result.id}</small><b>{result.score}</b><h3>{result.type}</h3><p>{result.verdict}</p><span className="poster-url">扫码再次鉴定</span></div>
          </aside>
        </div>
        <div className="result-actions"><button className="primary-action" onClick={onPoster}>生成鉴定海报 <Icon name="download" size={24} /></button><button className="secondary-action" onClick={onReset}>再测一次 <Icon name="reset" size={20} /></button></div>
      </section>
      <section className="evidence-section">
        <div className="evidence-copy"><small>鉴定依据 / {result.id}</small><h2>鉴定不是玄学，<br />豪气都有迹可循。</h2><ol>{result.evidence.map((item, index) => <li key={item}><span>0{index + 1}</span>{item}</li>)}</ol></div>
        <div className="commentary"><small>鉴定官总评</small><p>{result.comment}</p><span>建议 / 仅供娱乐，请勿过度修炼。</span></div>
      </section>
      <SpeciesGallery selected={speciesIndex} />
    </main>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const close = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('modal-open'); };
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={onClose} aria-label="关闭"><Icon name="close" /></button></header>{children}</section></div>;
}

function PosterModal({ result, onClose }) {
  const [dataUrl, setDataUrl] = useState('');
  useEffect(() => { let active = true; makePoster(result).then((url) => active && setDataUrl(url)); return () => { active = false; }; }, [result]);
  const download = () => { const link = document.createElement('a'); link.download = `嘉豪鉴定-${result.score}-${result.type}.png`; link.href = dataUrl; link.click(); };
  const share = async () => {
    if (!dataUrl) return;
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `嘉豪鉴定-${result.score}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ title: '我的嘉豪鉴定', text: `我的嘉豪指数是 ${result.score}，物种：${result.type}`, files: [file] });
    else download();
  };
  return <Modal title="分享你的鉴定海报" onClose={onClose} wide><div className="poster-modal-body">{dataUrl ? <img src={dataUrl} alt={`嘉豪指数 ${result.score}，${result.type}鉴定海报`} /> : <div className="poster-loading">豪气印刷中……</div>}<div className="poster-controls"><p>海报尺寸 1080 × 1440。图片只在你的浏览器本地生成，不会上传。</p><button className="primary-action" disabled={!dataUrl} onClick={download}>下载海报 <Icon name="download" /></button><button className="secondary-action" disabled={!dataUrl} onClick={share}>分享给朋友 <Icon name="share" /></button></div></div></Modal>;
}

function HistoryModal({ history, onClose, onSelect, onClear }) {
  return <Modal title="鉴定记录" onClose={onClose}><div className="history-list">{history.length ? history.map((item) => <button key={`${item.id}-${item.createdAt}`} onClick={() => { onSelect(item); onClose(); }}><span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span><strong>{item.score}</strong><em>{item.type}</em><Icon name="arrow" size={17} /></button>) : <p className="empty-history">还没有鉴定记录。<br />第一份豪气档案正在等你。</p>}</div>{history.length > 0 && <button className="text-action" onClick={onClear}>清空本地记录</button>}</Modal>;
}

export default function App() {
  const [result, setResult] = useState(null);
  const [posterOpen, setPosterOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { history, add, clear } = useHistory();
  const year = useMemo(() => new Date().getFullYear(), []);
  return (
    <div className="app-shell">
      <Header onHistory={() => setHistoryOpen(true)} />
      {result ? <Result result={result} onReset={() => { setResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onPoster={() => setPosterOpen(true)} /> : <Home onResult={setResult} addHistory={add} />}
      <footer><strong>嘉豪鉴定所</strong><span>© {year} 嘉豪鉴定开源实验项目</span><span>本地娱乐算法 · 不上传内容 · 不构成任何事实判断</span></footer>
      {posterOpen && <PosterModal result={result} onClose={() => setPosterOpen(false)} />}
      {historyOpen && <HistoryModal history={history} onClose={() => setHistoryOpen(false)} onSelect={(item) => { setResult(item); window.scrollTo({ top: 0 }); }} onClear={clear} />}
    </div>
  );
}
