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

export function battleCardLayout() {
  return {
    hero: { x: 62, y: 270, width: 620, height: 790 },
    scores: { x: 720, y: 210, width: 292, height: 460 },
    verdict: { x: 650, y: 710, width: 362, height: 350 },
    qr: { x: 72, y: 1178, width: 174, height: 174 },
  };
}

function drawImageContain(ctx, image, rect) {
  const scale = Math.min(rect.width / image.width, rect.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.drawImage(image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height);
}

function drawPortraitFrame(ctx, image, frame, rect) {
  const frameWidth = image.width / 3;
  const scale = Math.min(rect.width / frameWidth, rect.height / image.height);
  const width = frameWidth * scale;
  const height = image.height * scale;
  ctx.drawImage(image, frame * frameWidth, 0, frameWidth, image.height, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height);
}

export async function createBattleCard(result, shareUrl = window.location.origin) {
  const layout = battleCardLayout();
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f6f3ec';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#11110f';
  ctx.lineWidth = 3;
  ctx.strokeRect(42, 42, 996, 1356);
  ctx.fillStyle = '#11110f';
  ctx.font = '900 58px Arial, sans-serif';
  ctx.fillText('豪气宇宙', 72, 120);
  ctx.font = '700 24px Arial, sans-serif';
  ctx.fillText('嘉豪战绩 / 仅供娱乐', 74, 164);
  ctx.fillRect(72, 196, 940, 4);

  ctx.fillStyle = '#0b56f0';
  ctx.fillRect(layout.hero.x, layout.hero.y, layout.hero.width, layout.hero.height);
  ctx.fillStyle = '#f5f2e9';
  ctx.fillRect(layout.hero.x + 4, layout.hero.y + 4, layout.hero.width - 8, layout.hero.height - 8);

  const score = result.jiahao?.score ?? result.score;
  const portraitVariant = Math.abs(Number(score) || 0) % 6;
  const portraitSheet = await loadImage(portraitVariant < 3 ? '/assets/jiahao-species-labs.png' : '/assets/jiahao-species-blue.png').catch(() => null);
  if (portraitSheet) drawPortraitFrame(ctx, portraitSheet, portraitVariant % 3, { x: layout.hero.x + 8, y: layout.hero.y + 16, width: layout.hero.width - 16, height: layout.hero.height - 24 });
  ctx.fillStyle = '#11110f';
  ctx.font = '800 28px Arial, sans-serif';
  ctx.fillText('嘉豪指数', layout.scores.x, layout.scores.y + 24);
  ctx.fillStyle = '#0b56f0';
  ctx.font = '900 158px Arial, sans-serif';
  ctx.fillText(String(score).padStart(2, '0'), layout.scores.x - 8, layout.scores.y + 166);
  ctx.fillStyle = '#11110f';
  ctx.fillRect(layout.scores.x, layout.scores.y + 190, layout.scores.width, 3);
  ctx.font = '700 24px Arial, sans-serif';
  ctx.fillText('一份只讲嘉豪的鉴定', layout.scores.x, layout.scores.y + 242);

  ctx.fillStyle = '#efca16';
  ctx.fillRect(layout.verdict.x, layout.verdict.y, layout.verdict.width, 82);
  ctx.fillStyle = '#11110f';
  ctx.font = '900 36px Arial, sans-serif';
  wrap(ctx, result.jiahao?.type || result.type || '自在极意豪', layout.verdict.x + 18, layout.verdict.y + 53, layout.verdict.width - 36, 42, 2);
  ctx.font = '800 29px Arial, sans-serif';
  wrap(ctx, result.verdict || result.comment, layout.verdict.x + 18, layout.verdict.y + 130, layout.verdict.width - 36, 44, 5);

  ctx.fillStyle = '#11110f';
  ctx.fillRect(72, 1128, 940, 3);
  const qr = await loadImage(await QRCode.toDataURL(shareUrl, { width: 190, margin: 1, color: { dark: '#11110f', light: '#f5f2e9' } }));
  ctx.drawImage(qr, layout.qr.x, layout.qr.y, layout.qr.width, layout.qr.height);
  ctx.fillStyle = '#11110f';
  ctx.font = '900 32px Arial, sans-serif';
  ctx.fillText('扫码来测', 284, 1244);
  ctx.font = '600 23px Arial, sans-serif';
  ctx.fillText('测测你有多豪。', 284, 1286);
  ctx.fillStyle = '#68675f';
  ctx.font = '500 19px Arial, sans-serif';
  ctx.fillText('原始素材不入卡，仅展示娱乐结果。', 284, 1330);
  return canvas.toDataURL('image/png');
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
