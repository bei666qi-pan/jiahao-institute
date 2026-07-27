import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { isAcceptedFile, MAX_FILE_BYTES, MAX_FILES, validateFiles } from './validation';

export { isAcceptedFile, MAX_FILE_BYTES, MAX_FILES, validateFiles };
export const MAX_TEXT_CHARS = 20_000;
export const MAX_MODEL_IMAGES = 9;
export const MAX_PDF_PAGES = 10;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export async function imageFileToDataUrl(file, { maxEdge = 1280, quality = 0.78 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

async function readDocx(file) {
  const mammoth = await import('mammoth/mammoth.browser.js');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value || '';
}

async function renderPdfPage(page) {
  const viewport = page.getViewport({ scale: 1.35 });
  const scale = Math.min(1, 1280 / Math.max(viewport.width, viewport.height));
  const finalViewport = page.getViewport({ scale: 1.35 * scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(finalViewport.width));
  canvas.height = Math.max(1, Math.round(finalViewport.height));
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: finalViewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.72);
}

async function readPdf(file, remainingImageSlots) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const totalPages = document.numPages;
  const pageCount = Math.min(document.numPages, MAX_PDF_PAGES);
  const textParts = [];
  const images = [];
  for (let index = 1; index <= pageCount; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(' ').trim();
    if (pageText.length >= 40) textParts.push(`第 ${index} 页：${pageText}`);
    else if (images.length < remainingImageSlots) images.push(await renderPdfPage(page));
    page.cleanup();
  }
  await document.destroy();
  return { text: textParts.join('\n'), images, pageCount, totalPages };
}

export async function prepareFiles(files) {
  let extractedText = '';
  const images = [];
  const notes = [];
  for (const file of files) {
    if (IMAGE_TYPES.has(file.type)) {
      if (images.length < MAX_MODEL_IMAGES) images.push(await imageFileToDataUrl(file));
      continue;
    }
    if (file.type === 'text/plain' || /\.txt$/i.test(file.name)) {
      extractedText += `\n【${file.name}】\n${await file.text()}`;
      continue;
    }
    if (/\.docx$/i.test(file.name) || file.type.includes('wordprocessingml')) {
      extractedText += `\n【${file.name}】\n${await readDocx(file)}`;
      continue;
    }
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      const parsed = await readPdf(file, Math.max(0, MAX_MODEL_IMAGES - images.length));
      extractedText += `\n【${file.name}】\n${parsed.text}`;
      images.push(...parsed.images);
      if (parsed.totalPages > MAX_PDF_PAGES) notes.push(`${file.name} 仅分析前 ${MAX_PDF_PAGES} 页`);
    }
  }
  const normalized = extractedText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (normalized.length > MAX_TEXT_CHARS) notes.push(`文字内容已截取前 ${MAX_TEXT_CHARS.toLocaleString('zh-CN')} 字`);
  if (images.length >= MAX_MODEL_IMAGES) notes.push(`图片内容最多分析 ${MAX_MODEL_IMAGES} 张`);
  return {
    extractedText: normalized.slice(0, MAX_TEXT_CHARS),
    images: images.slice(0, MAX_MODEL_IMAGES),
    notes,
  };
}
