import { useState } from 'react';

export function ScenePicker({ scenes, currentSceneId, onChoose }) {
  const [category, setCategory] = useState('校园');
  const categories = ['校园', '工作', '朋友'].filter(value => scenes.some(scene => scene.category === value));
  const selected = categories.includes(category) ? category : categories[0];
  const choices = scenes.filter(scene => scene.category === selected);
  return <section className="scene-picker" aria-label="挑个你熟悉的场景">
    <h2>挑个你熟悉的场景</h2>
    <div className="scene-angles" aria-label="场景分类">{categories.map(value => <button key={value} type="button" aria-pressed={selected === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <div className="scene-picker-options">{choices.map(scene => <button key={scene.id} type="button" disabled={scene.id === currentSceneId} onClick={() => onChoose(scene.id)}><strong>{scene.title}{scene.id === currentSceneId ? ' · 正在玩' : ''}</strong><span>{scene.opening}</span></button>)}</div>
  </section>;
}
