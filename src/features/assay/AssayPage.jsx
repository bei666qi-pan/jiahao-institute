import { useRef, useState } from 'react';
import { postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
import { AiProgress } from '../../components/AiProgress';
import { prepareFiles, validateFiles } from '../../fileProcessing';
import { makeFallbackAssessment, upgradeClientResult } from '../../validation';
import { trackProductEvent } from '../../telemetry';

const MODES = [
  { id: 'photo', label: '照片', icon: 'image', accept: 'image/jpeg,image/png,image/webp' },
  { id: 'chat', label: '聊天记录', icon: 'chat', accept: 'image/jpeg,image/png,image/webp,application/pdf,text/plain,.docx' },
  { id: 'text', label: '文字', icon: 'text', accept: '' },
];

const EXAMPLES = ['也没什么，只是一个人习惯了。', '今天不想解释，懂的自然懂。', '我真没装，刚好拍到而已。'];

export function AssayPage({ onComplete, onNavigate }) {
  const [mode, setMode] = useState('photo');
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const selectMode = (nextMode) => {
    setMode(nextMode);
    setInput('');
    setFiles([]);
    setError('');
  };

  const chooseFiles = (event) => {
    try {
      const selected = validateFiles(event.target.files || [], { mode });
      setFiles(selected);
      setError('');
    } catch (nextError) {
      setFiles([]);
      setError(nextError.message);
    }
  };

  const submit = async () => {
    setError('');
    if (mode === 'text' && input.trim().length < 2) return setError('至少输入两个字，才有得测。');
    if (mode !== 'text' && !files.length) return setError(mode === 'photo' ? '先放一张照片进来。' : '先选择聊天截图或文档。');
    if (!consent) return setError('请先确认拥有内容使用权并同意本次娱乐分析。');
    setBusy(true);
    setStartedAt(Date.now());
    trackProductEvent('assessment_started', { mode });
    let result;
    try {
      const prepared = files.length ? await prepareFiles(files) : { images: [], extractedText: '' };
      const payload = await postJson('/api/analyze', {
        input: input.trim(),
        mode,
        images: prepared.images,
        extractedText: prepared.extractedText,
      });
      result = upgradeClientResult({ ...payload, mode, createdAt: Date.now() });
    } catch (nextError) {
      result = makeFallbackAssessment(input, mode, files);
      result.fallbackNotice = nextError.message;
    }
    trackProductEvent('assessment_completed', { mode, source: result.source, schemaVersion: result.schemaVersion });
    setBusy(false);
    onComplete(result);
  };

  const currentMode = MODES.find((item) => item.id === mode);
  return <main className="assay-page">
    <section className="assay-hero">
      <div className="assay-copy">
        <h1>测测你有多豪</h1>
        <p>照片、聊天记录或一句话，选一种就能开始。</p>
        <div className="assay-console">
          <div className="input-tabs" role="tablist" aria-label="鉴定素材类型">
            {MODES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} className={mode === item.id ? 'active' : ''} onClick={() => selectMode(item.id)}><Icon name={item.icon} size={19}/>{item.label}</button>)}
          </div>
          {mode === 'text'
            ? <div className="text-input-wrap">
                <textarea aria-label="要鉴定的文字" maxLength={500} value={input} onChange={(event) => setInput(event.target.value)} placeholder="例如：也没什么，只是一个人习惯了。" />
                <div className="example-options"><span>试试</span>{EXAMPLES.map((example, index) => <button key={example} type="button" onClick={() => setInput(example)}>0{index + 1}</button>)}<small>{input.length} / 500</small></div>
              </div>
            : <button type="button" className="upload-stage" onClick={() => fileRef.current?.click()}>
                <Icon name="upload" size={34}/>
                <strong>{files.length ? `已选择 ${files.length} 份素材` : mode === 'photo' ? '点击拍照或上传图片' : '点击上传聊天截图或文档'}</strong>
                <span>{files.length ? files.map((file) => file.name).join(' / ') : '选好就开测，原始内容不会保存'}</span>
              </button>}
          <input ref={fileRef} hidden type="file" multiple={mode === 'chat'} accept={currentMode.accept} onChange={chooseFiles} />
          <label className="consent-row"><input aria-label="同意将内容用于本次娱乐分析" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我确认有权使用这些内容，并同意用于本次娱乐鉴定。</span></label>
          {error ? <p className="form-message error" role="alert">{error}</p> : null}
          <button type="button" className="primary-button assay-submit" disabled={busy} onClick={submit}>{busy ? '正在看看你的豪气…' : '开始鉴定'}<Icon name="arrow"/></button>
          {busy ? <AiProgress label="AI 鉴定" kind="analysis" startedAt={startedAt} /> : null}
        </div>
      </div>
      <aside className="assay-editorial-photo"><img src="/assets/jiahao/hao-assay-editorial.webp" alt="靠在旧海报墙前的嘉豪" width="960" height="1200" loading="eager"/><p>好玩就行，不用当真。</p><button type="button" onClick={() => onNavigate('lab')}>想玩奶龙？去抽象实验室 <Icon name="arrow" size={17}/></button></aside>
    </section>
  </main>;
}
