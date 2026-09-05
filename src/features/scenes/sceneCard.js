import QRCode from 'qrcode';
import { sceneCardDestination } from './sceneCardDestination';

export async function createSceneCard({ scene, moment, ending, closingInput, lastReply, shareUrl, origin }) {
  const destinationUrl = sceneCardDestination({ sceneId: scene.id, shareUrl, origin });
  const qrData = await QRCode.toDataURL(destinationUrl, { width: 220, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#171715', light: '#f7f4ee' } });
  const qr = new Image();
  await new Promise((resolve, reject) => { qr.onload = resolve; qr.onerror = reject; qr.src = qrData; });
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  const ctx = canvas.getContext('2d');
  const lines = [];
  const wrap = (text, font) => {
    ctx.font = font;
    let line = '';
    for (const c of text) {
      if (c === '\n' || ctx.measureText(line + c).width > 880) { lines.push({ text: line, font }); line = c === '\n' ? '' : c; }
      else line += c;
    }
    if (line) lines.push({ text: line, font });
    lines.push({ text: '', font });
  };
  wrap(scene.title, 'bold 58px sans-serif');
  wrap(scene.opening, '34px sans-serif');
  if (typeof scene.evidence === 'string' && scene.evidence.trim()) wrap(`你看见的：${scene.evidence}`, '34px sans-serif');
  wrap(`我：${moment.input}`, 'bold 44px sans-serif');
  wrap(moment.reply, '40px sans-serif');
  if (moment.event) wrap(moment.event, '34px sans-serif');
  if (closingInput) wrap(`我最后说：${closingInput}`, '34px sans-serif');
  if (ending && ending !== moment.reply) wrap(`收场：${ending}`, 'bold 36px sans-serif');
  canvas.height = Math.max(1200, 440 + lines.length * 65);
  ctx.fillStyle = '#f7f4ee'; ctx.fillRect(0, 0, 1080, canvas.height);
  ctx.fillStyle = '#145bea'; ctx.fillRect(0, 0, 1080, 20);
  let y = 110;
  for (const line of lines) { ctx.font = line.font; ctx.fillStyle = '#171715'; ctx.fillText(line.text, 100, y); y += 65; }
  const footerY = canvas.height - 290;
  ctx.fillStyle = '#f2c51d'; ctx.fillRect(100, footerY - 24, 880, 6);
  ctx.drawImage(qr, 760, footerY, 220, 220);
  ctx.fillStyle = '#145bea'; ctx.font = 'bold 40px sans-serif'; ctx.fillText('扫码接同题', 100, footerY + 65);
  ctx.fillStyle = '#171715'; ctx.font = '30px sans-serif'; ctx.fillText('同一个现场，你会怎么接？', 100, footerY + 118);
  ctx.fillStyle = '#68665e'; ctx.font = '26px sans-serif';
  ctx.fillText(shareUrl ? '挑战链接七天有效' : '仅打开同题 · 未发布原句', 100, footerY + 165);
  ctx.fillText('豪气宇宙 · AI 即兴演出，仅供娱乐', 100, footerY + 208);
  return { canvas, destinationUrl };
}
