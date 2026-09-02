import { useRef, useState } from 'react';
import { postJson } from '../../app/api';
import { Icon } from '../../components/Icon';
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
    if (mode === 'text' && input.trim().length < 2) return setError('至少输入两个字，奶龙才能听懂。');
    if (mode !== 'text' && !files.length) return setError(mode === 'photo' ? '先放一张照片进来。' : '先选择聊天截图或文档。');
    if (!consent) return setError('请先确认拥有内容使用权并同意本次娱乐分析。');
    setBusy(true);
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
        <h1 aria-label="先别急着装正常。">先别急着<br/>装正常。</h1>
        <p>丢进照片、怪话或聊天记录，测测你到底有多豪，又有多奶。</p>
        <button type="button" className="assay-image-link" onClick={() => onNavigate('lab', 'image')}><Icon name="image" size={17}/> 想直接整活？让奶蛙替你演一张</button>
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
          <button type="button" className="primary-button assay-submit" disabled={busy} onClick={submit}>{busy ? '正在捕捉抽象信号…' : '开始抽象鉴定'}<Icon name="arrow"/></button>
        </div>
      </div>
      <aside className="preview-board" aria-label="双指数预览">
        <span className="preview-kicker">先看个样子 / 双指数试玩结果</span>
        <img src="/assets/nailoong/toes.webp" alt="抽象奶蛙低头数脚趾" />
        <span className="burst">抽象本蛙<br/>不背锅！</span>
        <div className="preview-scores"><div><span>嘉豪指数</span><strong>76</strong></div><div><span>奶龙指数</span><strong>91</strong></div></div>
        <small>奶蛙曰：<b>我裂开，但我装的。</b></small>
      </aside>
    </section>
  </main>;
}
