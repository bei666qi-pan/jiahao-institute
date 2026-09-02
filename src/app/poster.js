import QRCode from 'qrcode';

function wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const chars = [...String(text || '')];
  let line = '';
  let row = 0;
  for (const char of chars) {
    const candidate = line + char;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      row += 1;
      line = char;
      if (row >= maxLines - 1) break;
    } else line = candidate;
  }
  if (row < maxLines) ctx.fillText(line, x, y + row * lineHeight);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function createBattleCard(result, shareUrl = window.location.origin) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5f2e9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#11110f';
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 42, 996, 1356);
  ctx.fillStyle = '#11110f';
  ctx.font = '900 64px Arial, sans-serif';
  ctx.fillText('嘉豪鉴定所', 76, 126);
  ctx.font = '700 26px Arial, sans-serif';
  ctx.fillText('双指数战绩卡', 76, 176);

  ctx.fillStyle = '#0b56f0';
  ctx.font = '900 210px Arial, sans-serif';
  ctx.fillText(String(result.jiahao?.score ?? result.score).padStart(2, '0'), 70, 440);
  ctx.fillStyle = '#11110f';
  ctx.font = '800 30px Arial, sans-serif';
  ctx.fillText('嘉豪指数', 82, 488);

  ctx.fillStyle = '#efca16';
  ctx.font = '900 210px Arial, sans-serif';
  ctx.fillText(String(result.nailoong?.score ?? 0).padStart(2, '0'), 578, 440);
  ctx.fillStyle = '#11110f';
  ctx.font = '800 30px Arial, sans-serif';
  ctx.fillText('奶龙指数', 592, 488);

  const mascot = await loadImage('/assets/nailoong/arms.webp').catch(() => null);
  if (mascot) ctx.drawImage(mascot, 90, 550, 430, 438);
  ctx.fillStyle = '#efca16';
  ctx.fillRect(500, 570, 480, 88);
  ctx.fillStyle = '#11110f';
  ctx.font = '900 48px Arial, sans-serif';
  ctx.fillText(result.nailoong?.archetype || '淡人型奶龙豪', 526, 630);
  ctx.font = '800 34px Arial, sans-serif';
  wrap(ctx, result.nailoong?.verdict || result.verdict, 526, 730, 420, 52, 4);

  const qr = await loadImage(await QRCode.toDataURL(shareUrl, { width: 220, margin: 1, color: { dark: '#11110f', light: '#f5f2e9' } }));
  ctx.drawImage(qr, 76, 1134, 210, 210);
  ctx.fillStyle = '#11110f';
  ctx.font = '800 32px Arial, sans-serif';
  ctx.fillText('扫码测测你有多抽象', 326, 1218);
  ctx.font = '500 24px Arial, sans-serif';
  ctx.fillText('结果仅供娱乐，别太当真。', 326, 1262);
  return canvas.toDataURL('image/png');
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
